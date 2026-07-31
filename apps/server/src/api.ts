import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { PlatformSchema, ProxyConfigSchema } from "@autouploader/shared";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import type { Database } from "./db.js";
import { encryptCredentials, tokensEqual } from "./secrets.js";
import {
  makeObjectKey,
  MULTIPART_PART_SIZE,
  type ObjectStorage,
} from "./storage.js";

const AccountBodySchema = z.object({
  platform: PlatformSchema,
  label: z.string().min(1).max(120),
  credentials: z.record(z.string(), z.unknown()),
  proxy: ProxyConfigSchema.nullable().optional(),
});

const InitiateUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120).default("application/octet-stream"),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024),
});

const UploadPartSchema = z.object({
  partNumber: z.number().int().min(1).max(10_000),
});

const CompleteUploadSchema = z.object({
  parts: z.array(z.object({
    partNumber: z.number().int().min(1),
    etag: z.string().min(1),
  })).min(1),
});

const BatchSchema = z.object({
  requestId: z.string().min(1).max(200),
  accountIds: z.array(z.string().min(1)).min(1),
  videos: z.array(z.object({
    uploadId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    privacyStatus: z.enum(["private", "unlisted", "public"]).default("private"),
  })).min(1),
  scheduledAt: z.string().datetime().optional(),
});

interface ApiDependencies {
  config: ServerConfig;
  db: Database;
  storage: ObjectStorage;
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7);
}

async function listJobs(db: Database, userId: string, batchId?: string): Promise<unknown[]> {
  const rows = batchId
    ? await db`
      SELECT j.id, j.account_id AS "accountId", a.label AS "accountLabel",
        j.platform, j.video_id AS "videoId", v.original_name AS "filePath",
        COALESCE(v.title, '') AS title, j.status, j.attempts,
        j.last_error AS "lastError", j.scheduled_at AS "scheduledAt",
        j.created_at AS "createdAt", j.updated_at AS "updatedAt"
      FROM jobs j
      JOIN accounts a ON a.id = j.account_id
      JOIN videos v ON v.id = j.video_id
      WHERE j.user_id = ${userId} AND j.batch_id = ${batchId}
      ORDER BY j.created_at DESC
    `
    : await db`
      SELECT j.id, j.account_id AS "accountId", a.label AS "accountLabel",
        j.platform, j.video_id AS "videoId", v.original_name AS "filePath",
        COALESCE(v.title, '') AS title, j.status, j.attempts,
        j.last_error AS "lastError", j.scheduled_at AS "scheduledAt",
        j.created_at AS "createdAt", j.updated_at AS "updatedAt"
      FROM jobs j
      JOIN accounts a ON a.id = j.account_id
      JOIN videos v ON v.id = j.video_id
      WHERE j.user_id = ${userId}
      ORDER BY j.created_at DESC
      LIMIT 1000
    `;

  return rows.map((row) => ({
    ...row,
    scheduledAt: (row.scheduledAt as Date).toISOString(),
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  }));
}

export async function registerApi(
  app: FastifyInstance,
  { config, db, storage }: ApiDependencies,
): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") return;
    const token = bearerToken(request.headers.authorization);
    if (!token || !tokensEqual(token, config.SERVER_API_TOKEN)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    await db`
      UPDATE devices SET last_seen_at = now()
      WHERE id = ${config.SERVER_DEVICE_ID}
    `;
  });

  app.get("/health", async () => {
    await db`SELECT 1`;
    return { status: "ok", time: new Date().toISOString() };
  });

  app.put("/v1/accounts/:id", async (request) => {
    const accountId = z.string().min(1).parse((request.params as { id: string }).id);
    const body = AccountBodySchema.parse(request.body);
    const encrypted = encryptCredentials(body.credentials, config.CREDENTIALS_MASTER_KEY);
    await db`
      INSERT INTO accounts (
        id, user_id, platform, label, credentials_encrypted, proxy, updated_at
      )
      VALUES (
        ${accountId}, ${config.SERVER_USER_ID}, ${body.platform}, ${body.label},
        ${encrypted}, ${db.json(body.proxy ?? null)}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        platform = EXCLUDED.platform,
        label = EXCLUDED.label,
        credentials_encrypted = EXCLUDED.credentials_encrypted,
        proxy = EXCLUDED.proxy,
        deleted_at = NULL,
        updated_at = now()
      WHERE accounts.user_id = ${config.SERVER_USER_ID}
    `;
    return { id: accountId };
  });

  app.get("/v1/accounts", async () => {
    const rows = await db`
      SELECT id, platform, label, proxy, created_at AS "createdAt"
      FROM accounts
      WHERE user_id = ${config.SERVER_USER_ID} AND deleted_at IS NULL
      ORDER BY created_at
    `;
    return rows.map((row) => ({
      ...row,
      createdAt: (row.createdAt as Date).toISOString(),
    }));
  });

  app.delete("/v1/accounts/:id", async (request, reply) => {
    const accountId = z.string().min(1).parse((request.params as { id: string }).id);
    const active = await db`
      SELECT 1 FROM jobs
      WHERE account_id = ${accountId} AND status IN ('pending', 'running')
      LIMIT 1
    `;
    if (active.length) return reply.code(409).send({ error: "Account has active jobs" });
    await db`
      UPDATE accounts SET deleted_at = now(), updated_at = now()
      WHERE id = ${accountId} AND user_id = ${config.SERVER_USER_ID}
    `;
    return reply.code(204).send();
  });

  app.post("/v1/uploads/initiate", async (request) => {
    const body = InitiateUploadSchema.parse(request.body);
    const id = randomUUID();
    const objectKey = makeObjectKey(config.SERVER_USER_ID, body.fileName, id);
    const providerUploadId = await storage.createMultipart(objectKey, body.contentType);
    await db`
      INSERT INTO uploads (
        id, user_id, object_key, provider_upload_id, file_name, content_type, size_bytes
      )
      VALUES (
        ${id}, ${config.SERVER_USER_ID}, ${objectKey}, ${providerUploadId},
        ${body.fileName}, ${body.contentType}, ${body.sizeBytes}
      )
    `;
    return { uploadId: id, objectKey, partSize: MULTIPART_PART_SIZE };
  });

  app.post("/v1/uploads/:id/part-url", async (request, reply) => {
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    const body = UploadPartSchema.parse(request.body);
    const [upload] = await db`
      SELECT object_key, provider_upload_id, status
      FROM uploads
      WHERE id = ${id} AND user_id = ${config.SERVER_USER_ID}
    `;
    if (!upload) return reply.code(404).send({ error: "Upload not found" });
    if (upload.status !== "uploading") {
      return reply.code(409).send({ error: "Upload is not active" });
    }
    const url = await storage.signPart(
      upload.object_key as string,
      upload.provider_upload_id as string,
      body.partNumber,
    );
    return { url };
  });

  app.post("/v1/uploads/:id/complete", async (request, reply) => {
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    const body = CompleteUploadSchema.parse(request.body);
    const [upload] = await db`
      SELECT object_key, provider_upload_id, status
      FROM uploads
      WHERE id = ${id} AND user_id = ${config.SERVER_USER_ID}
    `;
    if (!upload) return reply.code(404).send({ error: "Upload not found" });
    if (upload.status === "complete") return { uploadId: id };
    await storage.completeMultipart(
      upload.object_key as string,
      upload.provider_upload_id as string,
      body.parts
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
    );
    await db`
      UPDATE uploads SET status = 'complete', completed_at = now()
      WHERE id = ${id}
    `;
    return { uploadId: id };
  });

  app.delete("/v1/uploads/:id", async (request, reply) => {
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    const [upload] = await db`
      SELECT object_key, provider_upload_id, status
      FROM uploads
      WHERE id = ${id} AND user_id = ${config.SERVER_USER_ID}
    `;
    if (!upload) return reply.code(204).send();
    if (upload.status === "uploading") {
      await storage.abortMultipart(
        upload.object_key as string,
        upload.provider_upload_id as string,
      ).catch(() => {});
    }
    await db`DELETE FROM uploads WHERE id = ${id}`;
    return reply.code(204).send();
  });

  app.post("/v1/batches", async (request, reply) => {
    const body = BatchSchema.parse(request.body);
    const [existing] = await db`
      SELECT id FROM upload_batches
      WHERE user_id = ${config.SERVER_USER_ID} AND request_id = ${body.requestId}
    `;
    if (existing) return listJobs(db, config.SERVER_USER_ID, existing.id as string);

    const batchId = randomUUID();
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    await db.begin(async (tx) => {
      const accountRows = await tx`
        SELECT id, platform FROM accounts
        WHERE user_id = ${config.SERVER_USER_ID}
          AND deleted_at IS NULL
          AND id IN ${tx(body.accountIds)}
      `;
      if (accountRows.length !== new Set(body.accountIds).size) {
        throw new Error("One or more accounts are not synchronized with the server");
      }
      const accountMap = new Map(accountRows.map((row) => [
        row.id as string,
        row.platform as string,
      ]));

      const uploadIds = body.videos.map((video) => video.uploadId);
      const uploadRows = await tx`
        SELECT id, object_key, file_name FROM uploads
        WHERE user_id = ${config.SERVER_USER_ID}
          AND status = 'complete'
          AND id IN ${tx(uploadIds)}
      `;
      if (uploadRows.length !== new Set(uploadIds).size) {
        throw new Error("One or more videos have not finished uploading");
      }
      const uploadMap = new Map(uploadRows.map((row) => [row.id as string, row]));

      await tx`
        INSERT INTO upload_batches (id, user_id, request_id)
        VALUES (${batchId}, ${config.SERVER_USER_ID}, ${body.requestId})
      `;

      for (const videoInput of body.videos) {
        const upload = uploadMap.get(videoInput.uploadId);
        if (!upload) throw new Error("Upload not found");
        const videoId = randomUUID();
        await tx`
          INSERT INTO videos (
            id, user_id, upload_id, object_key, original_name,
            title, description, privacy_status
          )
          VALUES (
            ${videoId}, ${config.SERVER_USER_ID}, ${videoInput.uploadId},
            ${upload.object_key as string}, ${upload.file_name as string},
            ${videoInput.title}, ${videoInput.description ?? null},
            ${videoInput.privacyStatus}
          )
        `;
        for (const accountId of [...new Set(body.accountIds)]) {
          await tx`
            INSERT INTO jobs (
              id, batch_id, user_id, account_id, video_id, platform, scheduled_at
            )
            VALUES (
              ${randomUUID()}, ${batchId}, ${config.SERVER_USER_ID}, ${accountId},
              ${videoId}, ${accountMap.get(accountId) ?? ""}, ${scheduledAt}
            )
          `;
        }
      }
    });

    return reply.code(201).send(await listJobs(db, config.SERVER_USER_ID, batchId));
  });

  app.get("/v1/jobs", async () => listJobs(db, config.SERVER_USER_ID));

  app.post("/v1/jobs/:id/retry", async (request, reply) => {
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    const rows = await db`
      UPDATE jobs
      SET status = 'pending', scheduled_at = now(), last_error = NULL,
        execution_stage = NULL, lease_owner = NULL, lease_expires_at = NULL,
        updated_at = now()
      WHERE id = ${id}
        AND user_id = ${config.SERVER_USER_ID}
        AND status IN ('failed', 'missed', 'needs_review', 'reauth_required')
      RETURNING id, video_id AS "videoId"
    `;
    if (!rows.length) return reply.code(409).send({ error: "Job cannot be retried" });
    await db`
      UPDATE videos SET delete_after = NULL
      WHERE id = ${rows[0]!.videoId as string}
    `;
    const jobs = await listJobs(db, config.SERVER_USER_ID);
    return jobs.find((job) => (job as { id: string }).id === id);
  });
}
