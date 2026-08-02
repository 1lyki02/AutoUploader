import { BrowserWindow, dialog, ipcMain } from "electron";
import { eq } from "drizzle-orm";
import {
  refreshYouTubeAccessToken,
  uploadYouTubeShort,
  uploadToTikTok,
  uploadToInstagram,
  uniquifyVideo,
} from "@autouploader/automation";
import type { CreateUploadBatch, ProxyConfig } from "@autouploader/shared";
import { getYoutubeOAuthCredentials } from "../../config/youtube.js";
import { getInstagramProxyFromEnv } from "../../config/instagram.js";
import { getDb } from "../../db/client.js";
import { accounts } from "../../db/schema.js";
import { getUploadScheduler } from "../../jobs/scheduler.js";
import { getLicenseService } from "../../license/service.js";
import { syncAccountToServer } from "../../remote/account-sync.js";
import { getServerApi } from "../../remote/server-api.js";
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
  const scheduler = getUploadScheduler();
  const server = getServerApi();
  scheduler.subscribe((job) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.uploadJobProgress, job);
    }
  });
  scheduler.start();
  if (server) {
    setInterval(() => {
      void server.listJobs().then((jobs) => {
        for (const job of jobs) {
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send(IPC_CHANNELS.uploadJobProgress, job);
          }
        }
      }).catch(() => {});
    }, 5000).unref();
  }

  ipcMain.handle(IPC_CHANNELS.pickVideoFile, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Видео", extensions: ["mp4", "mov", "webm"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.pickVideoFiles, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Видео", extensions: ["mp4", "mov", "webm"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC_CHANNELS.uploadToYoutube, async (_event, params: UploadYoutubeParams) => {
    await getLicenseService().assertCanPublish();
    const db = getDb();
    const row = db.select().from(accounts).where(eq(accounts.id, params.accountId)).get();
    if (!row) {
      throw new Error("Аккаунт не найден");
    }

    const { refreshToken } = decryptJson<{ refreshToken: string }>(row.credentials);
    const creds = getYoutubeOAuthCredentials();
    const { accessToken } = await refreshYouTubeAccessToken(creds, refreshToken);
    const unique = await uniquifyVideo(params.filePath);

    try {
      const { videoId } = await uploadYouTubeShort(
        creds,
        { accessToken, refreshToken },
        {
          filePath: unique.filePath,
          title: params.title,
          description: params.description,
          privacyStatus: params.privacyStatus ?? "private",
        },
      );
      return { videoId };
    } finally {
      await unique.cleanup();
    }
  });

  ipcMain.handle(IPC_CHANNELS.uploadToTiktok, async (_event, params: UploadTiktokParams) => {
    await getLicenseService().assertCanPublish();
    const db = getDb();
    const row = db.select().from(accounts).where(eq(accounts.id, params.accountId)).get();
    if (!row) {
      throw new Error("Аккаунт не найден");
    }

    const { storageState } = decryptJson<{ storageState: object }>(row.credentials);
    const proxy = row.proxy ? (JSON.parse(row.proxy) as ProxyConfig) : undefined;
    const unique = await uniquifyVideo(params.filePath);

    try {
      await uploadToTikTok({
        accountId: params.accountId,
        storageState,
        proxy,
        filePath: unique.filePath,
        caption: params.caption,
        headless: true,
      });
    } finally {
      await unique.cleanup();
    }
  });

  ipcMain.handle(IPC_CHANNELS.uploadToInstagram, async (_event, params: UploadInstagramParams) => {
    await getLicenseService().assertCanPublish();
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
    const unique = await uniquifyVideo(params.filePath);

    try {
      await uploadToInstagram({
        accountId: params.accountId,
        storageState: credentials.storageState,
        proxy,
        filePath: unique.filePath,
        caption: params.caption,
        headless: true,
      });
    } finally {
      await unique.cleanup();
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.createUploadBatch,
    async (event, request: CreateUploadBatch) => {
      await getLicenseService().assertCanPublish();
      if (!request.scheduledAt || !server) return scheduler.createBatch(request);
      const db = getDb();
      for (const accountId of [...new Set(request.accountIds)]) {
        const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
        if (!account) throw new Error("Выбранный аккаунт не найден");
        await syncAccountToServer(account);
      }
      return server.createBatch(request, (progress) => {
        event.sender.send(IPC_CHANNELS.uploadTransferProgress, progress);
      });
    },
  );
  ipcMain.handle(IPC_CHANNELS.listUploadJobs, async () => {
    const localJobs = scheduler.listJobs();
    if (!server) return localJobs;
    const remoteJobs = await server.listJobs();
    const remoteIds = new Set(remoteJobs.map((job) => job.id));
    return [...remoteJobs, ...localJobs.filter((job) => !remoteIds.has(job.id))]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  ipcMain.handle(IPC_CHANNELS.retryUploadJob, async (_event, jobId: string) => {
    await getLicenseService().assertCanPublish();
    const localJob = scheduler.listJobs().find((job) => job.id === jobId);
    if (localJob) return scheduler.retry(jobId);
    if (!server) throw new Error("Сервер не настроен");
    return server.retryJob(jobId);
  });
  ipcMain.handle(IPC_CHANNELS.cancelUploadJob, async (_event, jobId: string) => {
    const localJob = scheduler.listJobs().find((job) => job.id === jobId);
    if (localJob) return scheduler.cancel(jobId);
    throw new Error("Отмена доступна только для локальных заданий");
  });
}
