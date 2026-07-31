import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  executePlatformUpload,
  type StoredPlatformCredentials,
} from "@autouploader/automation";
import {
  PlatformSchema,
  type PrivacyStatus,
  type ProxyConfig,
} from "@autouploader/shared";
import type { ServerConfig } from "./config.js";
import type { Database } from "./db.js";
import { decryptCredentials } from "./secrets.js";
import type { ObjectStorage } from "./storage.js";

interface ClaimedJob {
  id: string;
  accountId: string;
  platform: string;
  credentialsEncrypted: string;
  proxy: ProxyConfig | null;
  videoId: string;
  objectKey: string;
  originalName: string;
  title: string | null;
  description: string | null;
  privacyStatus: PrivacyStatus;
}

export function isReauthenticationError(message: string): boolean {
  return /session|сесси|login|вход|challenge|oauth|refresh_token|unauthor/i.test(message);
}

async function recoverExpiredLeases(db: Database): Promise<void> {
  await db`
    UPDATE jobs
    SET status = CASE
        WHEN execution_stage = 'publishing' THEN 'needs_review'
        ELSE 'pending'
      END,
      last_error = CASE
        WHEN execution_stage = 'publishing'
          THEN 'Worker stopped during publication. Check the platform before retrying.'
        ELSE 'Worker lease expired; job returned to queue.'
      END,
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = now()
    WHERE status = 'running' AND lease_expires_at < now()
  `;
}

async function claimNextJob(
  db: Database,
  workerId: string,
  leaseSeconds: number,
): Promise<ClaimedJob | undefined> {
  try {
    return await db.begin(async (tx) => {
      const [candidate] = await tx`
        SELECT j.id
        FROM jobs j
        WHERE j.status = 'pending' AND j.scheduled_at <= now()
        ORDER BY j.scheduled_at, j.created_at
        FOR UPDATE OF j SKIP LOCKED
        LIMIT 1
      `;
      if (!candidate) return undefined;

      const [row] = await tx`
        UPDATE jobs j
        SET status = 'running', attempts = attempts + 1,
          execution_stage = 'downloading', lease_owner = ${workerId},
          lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
          last_error = NULL, updated_at = now()
        FROM accounts a, videos v
        WHERE j.id = ${candidate.id as string}
          AND a.id = j.account_id
          AND v.id = j.video_id
        RETURNING j.id, j.account_id AS "accountId", j.platform,
          a.credentials_encrypted AS "credentialsEncrypted", a.proxy,
          v.id AS "videoId", v.object_key AS "objectKey",
          v.original_name AS "originalName", v.title, v.description,
          v.privacy_status AS "privacyStatus"
      `;
      return row as ClaimedJob | undefined;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return undefined;
    throw error;
  }
}

export class UploadWorker {
  private readonly workerId = randomUUID();
  private active = 0;
  private timer?: NodeJS.Timeout;
  private cleaning = false;

  constructor(
    private readonly config: ServerConfig,
    private readonly db: Database,
    private readonly storage: ObjectStorage,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.pump(), 1000);
    void recoverExpiredLeases(this.db).then(() => this.pump());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async pump(): Promise<void> {
    while (this.active < this.config.WORKER_CONCURRENCY) {
      const job = await claimNextJob(
        this.db,
        this.workerId,
        this.config.LEASE_SECONDS,
      );
      if (!job) break;
      this.active += 1;
      void this.execute(job).finally(() => {
        this.active -= 1;
        void this.pump();
      });
    }
    if (!this.cleaning) void this.cleanup();
  }

  private async execute(job: ClaimedJob): Promise<void> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "autouploader-"));
    const localPath = path.join(tempDir, path.basename(job.originalName));
    let stage: "downloading" | "publishing" = "downloading";
    const heartbeat = setInterval(() => {
      void this.db`
        UPDATE jobs
        SET lease_expires_at = now() + (${this.config.LEASE_SECONDS} * interval '1 second')
        WHERE id = ${job.id} AND lease_owner = ${this.workerId} AND status = 'running'
      `;
    }, Math.max(30_000, (this.config.LEASE_SECONDS * 1000) / 3));

    try {
      await this.storage.downloadToFile(job.objectKey, localPath);
      stage = "publishing";
      await this.db`
        UPDATE jobs SET execution_stage = 'publishing', updated_at = now()
        WHERE id = ${job.id} AND lease_owner = ${this.workerId}
      `;
      await executePlatformUpload({
        platform: PlatformSchema.parse(job.platform),
        accountId: job.accountId,
        credentials: decryptCredentials<StoredPlatformCredentials>(
          job.credentialsEncrypted,
          this.config.CREDENTIALS_MASTER_KEY,
        ),
        proxy: job.proxy ?? undefined,
        filePath: localPath,
        title: job.title ?? undefined,
        description: job.description ?? undefined,
        privacyStatus: job.privacyStatus,
        youtubeOAuth: {
          clientId: this.config.YOUTUBE_CLIENT_ID,
          clientSecret: this.config.YOUTUBE_CLIENT_SECRET,
        },
        headless: true,
      });
      await this.db.begin(async (tx) => {
        await tx`
          UPDATE jobs
          SET status = 'done', execution_stage = NULL, lease_owner = NULL,
            lease_expires_at = NULL, last_error = NULL, updated_at = now()
          WHERE id = ${job.id} AND lease_owner = ${this.workerId}
        `;
        await tx`
          UPDATE videos v
          SET delete_after = now() + (${this.config.VIDEO_RETENTION_HOURS} * interval '1 hour')
          WHERE v.id = ${job.videoId}
            AND NOT EXISTS (
              SELECT 1 FROM jobs j
              WHERE j.video_id = v.id AND j.status <> 'done'
            )
        `;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = isReauthenticationError(message)
        ? "reauth_required"
        : stage === "publishing"
          ? "needs_review"
          : "failed";
      await this.db.begin(async (tx) => {
        await tx`
          UPDATE jobs
          SET status = ${status}, last_error = ${message}, execution_stage = NULL,
            lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
          WHERE id = ${job.id} AND lease_owner = ${this.workerId}
        `;
        await tx`
          UPDATE videos v
          SET delete_after = now() + (${this.config.UPLOAD_RETENTION_HOURS} * interval '1 hour')
          WHERE v.id = ${job.videoId}
            AND NOT EXISTS (
              SELECT 1 FROM jobs j
              WHERE j.video_id = v.id AND j.status IN ('pending', 'running')
            )
        `;
      });
    } finally {
      clearInterval(heartbeat);
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async cleanup(): Promise<void> {
    this.cleaning = true;
    try {
      const expired = await this.db`
        SELECT DISTINCT v.upload_id AS "uploadId", v.object_key AS "objectKey"
        FROM videos v
        WHERE v.delete_after IS NOT NULL AND v.delete_after <= now()
        LIMIT 20
      `;
      for (const row of expired) {
        await this.storage.deleteObject(row.objectKey as string);
        await this.db`
          UPDATE uploads SET status = 'deleted'
          WHERE id = ${row.uploadId as string}
        `;
        await this.db`
          UPDATE videos SET delete_after = NULL
          WHERE upload_id = ${row.uploadId as string}
        `;
      }

      const abandoned = await this.db`
        SELECT id, object_key AS "objectKey", provider_upload_id AS "providerUploadId"
        FROM uploads
        WHERE status = 'uploading'
          AND created_at < now() - (${this.config.UPLOAD_RETENTION_HOURS} * interval '1 hour')
        LIMIT 20
      `;
      for (const row of abandoned) {
        await this.storage.abortMultipart(
          row.objectKey as string,
          row.providerUploadId as string,
        ).catch(() => {});
        await this.db`DELETE FROM uploads WHERE id = ${row.id as string}`;
      }
    } finally {
      this.cleaning = false;
    }
  }
}
