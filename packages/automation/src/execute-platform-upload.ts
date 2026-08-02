import path from "node:path";
import type { Platform, PrivacyStatus, ProxyConfig } from "@autouploader/shared";
import {
  type YouTubeOAuthCredentials,
  refreshYouTubeAccessToken,
} from "./youtube/auth.js";
import { uploadYouTubeShort } from "./youtube/upload.js";
import { uploadToTikTok } from "./tiktok/upload.js";
import { uploadToInstagram } from "./instagram/upload.js";
import { uniquifyVideo } from "./video-uniquify.js";

export interface StoredPlatformCredentials {
  refreshToken?: string;
  storageState?: object;
}

export interface ExecutePlatformUploadParams {
  platform: Platform;
  accountId: string;
  credentials: StoredPlatformCredentials;
  proxy?: ProxyConfig;
  filePath: string;
  title?: string;
  description?: string;
  privacyStatus?: PrivacyStatus;
  youtubeOAuth?: YouTubeOAuthCredentials;
  headless?: boolean;
  /** Soft uniqueness transform before upload. Default true. */
  uniquify?: boolean;
  signal?: AbortSignal;
}

export async function executePlatformUpload(
  params: ExecutePlatformUploadParams,
): Promise<void> {
  if (params.signal?.aborted) {
    throw new DOMException("Upload cancelled", "AbortError");
  }

  const text =
    params.description?.trim() || params.title?.trim() || path.parse(params.filePath).name;
  const unique = params.uniquify === false
    ? { filePath: params.filePath, cleanup: async () => undefined }
    : await uniquifyVideo(params.filePath);

  try {
    if (params.platform === "youtube") {
      if (!params.credentials.refreshToken || !params.youtubeOAuth) {
        throw new Error("YouTube credentials are incomplete");
      }
      const { accessToken } = await refreshYouTubeAccessToken(
        params.youtubeOAuth,
        params.credentials.refreshToken,
      );
      await uploadYouTubeShort(
        params.youtubeOAuth,
        { accessToken, refreshToken: params.credentials.refreshToken },
        {
          filePath: unique.filePath,
          title: text,
          privacyStatus: params.privacyStatus ?? "private",
        },
      );
      return;
    }

    if (!params.credentials.storageState) {
      throw new Error("Сессия аккаунта отсутствует. Переподключите аккаунт.");
    }

    if (params.platform === "tiktok") {
      await uploadToTikTok({
        accountId: params.accountId,
        storageState: params.credentials.storageState,
        proxy: params.proxy,
        filePath: unique.filePath,
        caption: text,
        headless: params.headless,
      });
      return;
    }

    await uploadToInstagram({
      accountId: params.accountId,
      storageState: params.credentials.storageState,
      proxy: params.proxy,
      filePath: unique.filePath,
      caption: text,
      headless: params.headless,
      signal: params.signal,
    });
  } finally {
    await unique.cleanup();
  }
}
