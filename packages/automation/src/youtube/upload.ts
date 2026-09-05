import fs from "node:fs";
import { OAuth2Client } from "google-auth-library";
import type { YouTubeOAuthCredentials } from "./auth.js";

export interface YouTubeUploadParams {
  filePath: string;
  title: string;
  description?: string;
  tags?: string[];
  /** Ignored when publishAt is set — YouTube requires privacyStatus 'private' for scheduled videos. */
  privacyStatus?: "private" | "unlisted" | "public";
  /** ISO 8601 timestamp. Forces privacyStatus to 'private' until the scheduled time. */
  publishAt?: string;
  madeForKids?: boolean;
}

const UPLOAD_MAX_ATTEMPTS = 8;
const CHUNK_SIZE = 256 * 1024 * 8; // 2 MiB, multiple of 256 KiB
const RESUMABLE_INIT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      if ("code" in current && current.code) {
        parts.push(String(current.code));
      }
    } else {
      parts.push(String(current));
    }
    current =
      typeof current === "object" && current && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }

  return parts.join(" ").toLowerCase();
}

function isRetryableYouTubeUploadError(error: unknown): boolean {
  const blob = collectErrorText(error);
  return (
    blob.includes("econnreset")
    || blob.includes("etimedout")
    || blob.includes("econnrefused")
    || blob.includes("epipe")
    || blob.includes("enotfound")
    || blob.includes("eai_again")
    || blob.includes("socket hang up")
    || blob.includes("network error")
    || blob.includes("failed, reason:")
  );
}

function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 5_000 * 2 ** (attempt - 1));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFileChunk(filePath: string, start: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = fs.createReadStream(filePath, {
      start,
      end: start + length - 1,
    });
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function nextChunkEnd(offset: number, fileSize: number): number {
  if (fileSize - offset <= CHUNK_SIZE) {
    return fileSize;
  }

  const end = offset + CHUNK_SIZE;
  const chunkLength = end - offset;
  const remainder = chunkLength % (256 * 1024);
  if (remainder === 0) {
    return end;
  }

  return end - remainder;
}

function extractVideoId(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || !("id" in data)) {
    return undefined;
  }
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function parseUploadedOffset(headers: Record<string, unknown> | undefined, fileSize: number): number {
  const rangeHeader = headers?.range ?? headers?.Range;
  if (typeof rangeHeader !== "string") {
    return 0;
  }

  const match = rangeHeader.match(/bytes=\d+-(\d+)/);
  if (!match) {
    return 0;
  }

  const lastByte = Number.parseInt(match[1], 10);
  if (!Number.isFinite(lastByte)) {
    return 0;
  }

  return Math.min(fileSize, lastByte + 1);
}

async function initiateResumableUpload(
  auth: OAuth2Client,
  requestBody: Record<string, unknown>,
  fileSize: number,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await auth.request<{ id?: string }>({
        url: RESUMABLE_INIT_URL,
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(fileSize),
          "X-Upload-Content-Type": "video/*",
        },
        data: requestBody,
        responseType: "json",
        validateStatus: (status) => status === 200,
      });

      const uploadUrl = res.headers?.location ?? res.headers?.Location;
      if (typeof uploadUrl !== "string" || uploadUrl.length === 0) {
        throw new Error("YouTube не вернул URL для resumable upload");
      }

      return uploadUrl;
    } catch (error) {
      lastError = error;
      if (attempt === UPLOAD_MAX_ATTEMPTS || !isRetryableYouTubeUploadError(error)) {
        throw error;
      }
      await wait(retryDelayMs(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function queryUploadProgress(
  auth: OAuth2Client,
  uploadUrl: string,
  fileSize: number,
): Promise<{ offset: number; videoId?: string }> {
  const res = await auth.request<{ id?: string }>({
    url: uploadUrl,
    method: "PUT",
    headers: {
      "Content-Length": "0",
      "Content-Range": `bytes */${fileSize}`,
    },
    responseType: "json",
    validateStatus: (status) => (status >= 200 && status < 300) || status === 308,
  });

  if (res.status >= 200 && res.status < 300) {
    const videoId = extractVideoId(res.data);
    if (videoId) {
      return { offset: fileSize, videoId };
    }
  }

  return {
    offset: parseUploadedOffset(res.headers as Record<string, unknown>, fileSize),
  };
}

async function uploadFileResumable(
  auth: OAuth2Client,
  uploadUrl: string,
  filePath: string,
  fileSize: number,
): Promise<{ videoId: string }> {
  let offset = 0;

  while (offset < fileSize) {
    const chunkStart = offset;
    const end = nextChunkEnd(offset, fileSize);
    const length = end - offset;
    const body = await readFileChunk(filePath, offset, length);

    let chunkUploaded = false;
    let lastError: unknown;

    for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await auth.request<{ id?: string }>({
          url: uploadUrl,
          method: "PUT",
          headers: {
            "Content-Length": String(length),
            "Content-Type": "video/*",
            "Content-Range": `bytes ${offset}-${end - 1}/${fileSize}`,
          },
          data: body,
          responseType: "json",
          validateStatus: (status) => (status >= 200 && status < 300) || status === 308,
        });

        if (res.status >= 200 && res.status < 300) {
          const videoId = extractVideoId(res.data);
          if (!videoId) {
            throw new Error("YouTube API не вернул id загруженного видео");
          }
          return { videoId };
        }

        offset = end;
        chunkUploaded = true;
        break;
      } catch (error) {
        lastError = error;
        if (attempt === UPLOAD_MAX_ATTEMPTS || !isRetryableYouTubeUploadError(error)) {
          throw error;
        }

        const progress = await queryUploadProgress(auth, uploadUrl, fileSize);
        if (progress.videoId) {
          return { videoId: progress.videoId };
        }

        offset = progress.offset;
        await wait(retryDelayMs(attempt));
        break;
      }
    }

    if (!chunkUploaded) {
      if (offset <= chunkStart) {
        throw lastError instanceof Error
          ? lastError
          : new Error("YouTube upload failed before the next chunk could be sent");
      }
    }
  }

  const progress = await queryUploadProgress(auth, uploadUrl, fileSize);
  if (progress.videoId) {
    return { videoId: progress.videoId };
  }

  throw new Error("YouTube upload завершился без id видео");
}

export async function uploadYouTubeShort(
  creds: YouTubeOAuthCredentials,
  tokens: { accessToken: string; refreshToken: string },
  params: YouTubeUploadParams,
): Promise<{ videoId: string }> {
  const auth = new OAuth2Client(creds.clientId, creds.clientSecret);
  auth.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  const fileSize = fs.statSync(params.filePath).size;
  const requestBody = {
    snippet: {
      title: params.title,
      description: params.description,
      tags: params.tags,
    },
    status: {
      privacyStatus: params.publishAt ? "private" : (params.privacyStatus ?? "public"),
      publishAt: params.publishAt,
      selfDeclaredMadeForKids: params.madeForKids ?? false,
    },
  };

  const uploadUrl = await initiateResumableUpload(auth, requestBody, fileSize);
  return uploadFileResumable(auth, uploadUrl, params.filePath, fileSize);
}
