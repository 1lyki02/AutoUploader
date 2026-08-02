import { eq } from "drizzle-orm";
import { executePlatformUpload } from "@autouploader/automation";
import { PlatformSchema, type ProxyConfig } from "@autouploader/shared";
import { getInstagramProxyFromEnv } from "../config/instagram.js";
import { getYoutubeOAuthCredentials } from "../config/youtube.js";
import { getDb } from "../db/client.js";
import { accounts, videos, type JobRow } from "../db/schema.js";
import { decryptJson } from "../secrets/vault.js";

function instagramProxy(rowProxy: string | null): ProxyConfig | undefined {
  if (rowProxy) return JSON.parse(rowProxy) as ProxyConfig;
  return getInstagramProxyFromEnv();
}

export async function executeUploadJob(job: JobRow, signal?: AbortSignal): Promise<void> {
  const db = getDb();
  const account = db.select().from(accounts).where(eq(accounts.id, job.accountId)).get();
  const video = db.select().from(videos).where(eq(videos.id, job.videoId)).get();
  if (!account) throw new Error("Аккаунт задания не найден");
  if (!video) throw new Error("Видеофайл задания не найден");

  const platform = PlatformSchema.parse(account.platform);
  await executePlatformUpload({
    platform,
    accountId: account.id,
    credentials: decryptJson(account.credentials),
    proxy: platform === "instagram"
      ? instagramProxy(account.proxy)
      : account.proxy
        ? (JSON.parse(account.proxy) as ProxyConfig)
        : undefined,
    filePath: video.filePath,
    title: video.title ?? undefined,
    description: video.description ?? undefined,
    privacyStatus: video.privacyStatus as "private" | "unlisted" | "public",
    youtubeOAuth: platform === "youtube" ? getYoutubeOAuthCredentials() : undefined,
    headless: true,
    signal,
  });
}
