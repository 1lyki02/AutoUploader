import { open, stat } from "node:fs/promises";
import path from "node:path";
import {
  CreateUploadBatchSchema,
  UploadJobSummarySchema,
  type CreateUploadBatch,
  type Platform,
  type ProxyConfig,
  type UploadJobSummary,
  type UploadTransferProgress,
} from "@autouploader/shared";

interface ServerApiOptions {
  baseUrl: string;
  token: string;
}

interface SyncedAccount {
  id: string;
  platform: Platform;
  label: string;
  credentials: Record<string, unknown>;
  proxy?: ProxyConfig | null;
}

interface InitiatedUpload {
  uploadId: string;
  partSize: number;
}

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  return "application/octet-stream";
}

export class ServerApi {
  private readonly baseUrl: string;

  constructor(private readonly options: ServerApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(
    route: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (authenticated) headers.set("Authorization", `Bearer ${this.options.token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${this.baseUrl}${route}`, { ...init, headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? `Server request failed (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async health(): Promise<void> {
    await this.request("/health", {}, false);
  }

  async syncAccount(account: SyncedAccount): Promise<void> {
    await this.request(`/v1/accounts/${encodeURIComponent(account.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        platform: account.platform,
        label: account.label,
        credentials: account.credentials,
        proxy: account.proxy ?? null,
      }),
    });
  }

  async deleteAccount(accountId: string): Promise<void> {
    await this.request(`/v1/accounts/${encodeURIComponent(accountId)}`, {
      method: "DELETE",
    });
  }

  private async uploadVideo(
    filePath: string,
    fileIndex: number,
    fileCount: number,
    onProgress?: (progress: UploadTransferProgress) => void,
  ): Promise<string> {
    const fileStat = await stat(filePath);
    const initiated = await this.request<InitiatedUpload>("/v1/uploads/initiate", {
      method: "POST",
      body: JSON.stringify({
        fileName: path.basename(filePath),
        contentType: contentType(filePath),
        sizeBytes: fileStat.size,
      }),
    });

    const file = await open(filePath, "r");
    const completedParts: Array<{ partNumber: number; etag: string }> = [];
    try {
      const partCount = Math.ceil(fileStat.size / initiated.partSize);
      for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
        const start = (partNumber - 1) * initiated.partSize;
        const length = Math.min(initiated.partSize, fileStat.size - start);
        const buffer = Buffer.allocUnsafe(length);
        await file.read(buffer, 0, length, start);
        const { url } = await this.request<{ url: string }>(
          `/v1/uploads/${initiated.uploadId}/part-url`,
          {
            method: "POST",
            body: JSON.stringify({ partNumber }),
          },
        );
        const uploadResponse = await fetch(url, { method: "PUT", body: buffer });
        if (!uploadResponse.ok) {
          throw new Error(`Video part upload failed (${uploadResponse.status})`);
        }
        const etag = uploadResponse.headers.get("etag");
        if (!etag) throw new Error("Object storage did not return an ETag");
        completedParts.push({ partNumber, etag });
        const uploadedBytes = Math.min(partNumber * initiated.partSize, fileStat.size);
        onProgress?.({
          fileName: path.basename(filePath),
          fileIndex,
          fileCount,
          uploadedBytes,
          totalBytes: fileStat.size,
          percent: Math.round((uploadedBytes / fileStat.size) * 100),
        });
      }
      await this.request(`/v1/uploads/${initiated.uploadId}/complete`, {
        method: "POST",
        body: JSON.stringify({ parts: completedParts }),
      });
      return initiated.uploadId;
    } catch (error) {
      await this.request(`/v1/uploads/${initiated.uploadId}`, {
        method: "DELETE",
      }).catch(() => {});
      throw error;
    } finally {
      await file.close();
    }
  }

  async createBatch(
    input: CreateUploadBatch,
    onProgress?: (progress: UploadTransferProgress) => void,
  ): Promise<UploadJobSummary[]> {
    const request = CreateUploadBatchSchema.parse(input);
    const uploadIds: string[] = [];
    for (const [index, video] of request.videos.entries()) {
      uploadIds.push(await this.uploadVideo(
        video.filePath,
        index,
        request.videos.length,
        onProgress,
      ));
    }
    const requestId = crypto.randomUUID();
    const batchBody = JSON.stringify({
      requestId,
      accountIds: request.accountIds,
      videos: request.videos.map((video, index) => ({
        uploadId: uploadIds[index],
        title: video.title,
        description: video.description,
        privacyStatus: video.privacyStatus,
      })),
      scheduledAt: request.scheduledAt,
    });
    let jobs: unknown[];
    try {
      jobs = await this.request<unknown[]>("/v1/batches", {
        method: "POST",
        body: batchBody,
      });
    } catch {
      jobs = await this.request<unknown[]>("/v1/batches", {
        method: "POST",
        body: batchBody,
      });
    }
    return jobs.map((job) => UploadJobSummarySchema.parse(job));
  }

  async listJobs(): Promise<UploadJobSummary[]> {
    const jobs = await this.request<unknown[]>("/v1/jobs");
    return jobs.map((job) => UploadJobSummarySchema.parse(job));
  }

  async retryJob(jobId: string): Promise<UploadJobSummary> {
    return UploadJobSummarySchema.parse(await this.request(
      `/v1/jobs/${encodeURIComponent(jobId)}/retry`,
      { method: "POST" },
    ));
  }
}

let serverApi: ServerApi | undefined;

export function getServerApi(): ServerApi | undefined {
  const baseUrl = process.env.AUTOUPLOADER_SERVER_URL?.trim();
  const token = process.env.AUTOUPLOADER_SERVER_TOKEN?.trim();
  if (!baseUrl || !token) return undefined;
  serverApi ??= new ServerApi({ baseUrl, token });
  return serverApi;
}
