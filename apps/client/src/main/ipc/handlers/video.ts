import { dialog, ipcMain } from "electron";
import { eq } from "drizzle-orm";
import {
  refreshYouTubeAccessToken,
  uploadYouTubeShort,
  uploadToTikTok,
  uploadToInstagram,
} from "@autouploader/automation";
import type { ProxyConfig } from "@autouploader/shared";
import { getYoutubeOAuthCredentials } from "../../config/youtube.js";
import { getInstagramProxyFromEnv } from "../../config/instagram.js";
import { getDb } from "../../db/client.js";
import { accounts } from "../../db/schema.js";
import { decryptJson } from "../../secrets/vault.js";
import { IPC_CHANNELS } from "../channels.js";

export interface UploadYoutubeParams {
  accountId: string;
  filePath: string;
  title: string;
  description?: string;
  privacyStatus?: "private" | "unlisted" | "public";
}

export interface UploadTiktokParams {
  accountId: string;
  filePath: string;
  caption?: string;
}

export interface UploadInstagramParams {
  accountId: string;
  filePath: string;
  caption?: string;
}

function resolveInstagramProxy(rowProxy: string | null): ProxyConfig | undefined {
  if (rowProxy) {
    return JSON.parse(rowProxy) as ProxyConfig;
  }
  return getInstagramProxyFromEnv();
}

export function registerVideoHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.pickVideoFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Видео", extensions: ["mp4", "mov", "webm"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.uploadToYoutube, async (_event, params: UploadYoutubeParams) => {
    const db = getDb();
    const row = db.select().from(accounts).where(eq(accounts.id, params.accountId)).get();
    if (!row) {
      throw new Error("Аккаунт не найден");
    }

    const { refreshToken } = decryptJson<{ refreshToken: string }>(row.credentials);
    const creds = getYoutubeOAuthCredentials();
    const { accessToken } = await refreshYouTubeAccessToken(creds, refreshToken);

    const { videoId } = await uploadYouTubeShort(
      creds,
      { accessToken, refreshToken },
      {
        filePath: params.filePath,
        title: params.title,
        description: params.description,
        privacyStatus: params.privacyStatus ?? "private",
      },
    );

    return { videoId };
  });

  ipcMain.handle(IPC_CHANNELS.uploadToTiktok, async (_event, params: UploadTiktokParams) => {
    const db = getDb();
    const row = db.select().from(accounts).where(eq(accounts.id, params.accountId)).get();
    if (!row) {
      throw new Error("Аккаунт не найден");
    }

    const { storageState } = decryptJson<{ storageState: object }>(row.credentials);
    const proxy = row.proxy ? (JSON.parse(row.proxy) as ProxyConfig) : undefined;

    await uploadToTikTok({
      accountId: params.accountId,
      storageState,
      proxy,
      filePath: params.filePath,
      caption: params.caption,
    });
  });

  ipcMain.handle(IPC_CHANNELS.uploadToInstagram, async (_event, params: UploadInstagramParams) => {
    const db = getDb();
    const row = db.select().from(accounts).where(eq(accounts.id, params.accountId)).get();
    if (!row) {
      throw new Error("Аккаунт не найден");
    }

    const credentials = decryptJson<{ storageState?: object; username?: string; password?: string }>(
      row.credentials,
    );
    if (!credentials.storageState) {
      throw new Error(
        "Этот Instagram-аккаунт сохранён в старом формате (логин/пароль). Удалите его и подключите заново — откроется браузер для ручного входа.",
      );
    }

    const proxy = resolveInstagramProxy(row.proxy);

    await uploadToInstagram({
      accountId: params.accountId,
      storageState: credentials.storageState,
      proxy,
      filePath: params.filePath,
      caption: params.caption,
    });
  });
}
