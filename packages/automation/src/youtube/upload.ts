import fs from "node:fs";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
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

const UPLOAD_MAX_ATTEMPTS = 3;
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

function isRetryableYouTubeUploadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code = "code" in error ? String(error.code) : "";
  if (RETRYABLE_NETWORK_CODES.has(code)) return true;

  const message = error instanceof Error ? error.message : String(error);
  return (
    RETRYABLE_NETWORK_CODES.has(message)
    || message.includes("ECONNRESET")
    || message.includes("ETIMEDOUT")
    || message.includes("socket hang up")
    || message.toLowerCase().includes("network")
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const youtube = google.youtube({ version: "v3", auth });
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

  let lastError: unknown;
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody,
        media: {
          body: fs.createReadStream(params.filePath),
        },
      });

      const videoId = res.data.id;
      if (!videoId) {
        throw new Error("YouTube API не вернул id загруженного видео");
      }

      return { videoId };
    } catch (error) {
      lastError = error;
      if (attempt === UPLOAD_MAX_ATTEMPTS || !isRetryableYouTubeUploadError(error)) {
        throw error;
      }
      await wait(4000 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
