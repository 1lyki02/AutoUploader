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

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
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
    },
    media: {
      body: fs.createReadStream(params.filePath),
    },
  });

  const videoId = res.data.id;
  if (!videoId) {
    throw new Error("YouTube API не вернул id загруженного видео");
  }

  return { videoId };
}
