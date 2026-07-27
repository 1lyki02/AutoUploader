import { randomUUID } from "node:crypto";
import { ipcMain, shell } from "electron";
import { eq } from "drizzle-orm";
import { runYouTubeLoginFlow, runTikTokLoginFlow, runInstagramLoginFlow } from "@autouploader/automation";
import { ProxyConfigSchema, type ProxyConfig } from "@autouploader/shared";
import { getYoutubeOAuthCredentials } from "../../config/youtube.js";
import { getInstagramProxyFromEnv } from "../../config/instagram.js";
import { getDb } from "../../db/client.js";
import { accounts, type AccountRow } from "../../db/schema.js";
import { encryptJson } from "../../secrets/vault.js";
import { IPC_CHANNELS } from "../channels.js";

export interface AccountSummary {
  id: string;
  platform: string;
  label: string;
  proxy: ProxyConfig | null;
  createdAt: string;
}

function toSummary(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    platform: row.platform,
    label: row.label,
    proxy: row.proxy ? (JSON.parse(row.proxy) as ProxyConfig) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function registerAccountsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.connectYoutubeAccount, async (_event, label: string) => {
    const creds = getYoutubeOAuthCredentials();
    const tokens = await runYouTubeLoginFlow(creds, (url) => {
      void shell.openExternal(url);
    });

    const db = getDb();
    const id = randomUUID();
    db.insert(accounts)
      .values({
        id,
        platform: "youtube",
        label,
        credentials: encryptJson({ refreshToken: tokens.refreshToken }),
        proxy: null,
        createdAt: new Date(),
      })
      .run();

    return { id, label };
  });

  ipcMain.handle(IPC_CHANNELS.connectTiktokAccount, async (_event, label: string) => {
    const { storageState } = await runTikTokLoginFlow();

    const db = getDb();
    const id = randomUUID();
    db.insert(accounts)
      .values({
        id,
        platform: "tiktok",
        label,
        credentials: encryptJson({ storageState }),
        proxy: null,
        createdAt: new Date(),
      })
      .run();

    return { id, label };
  });

  ipcMain.handle(IPC_CHANNELS.connectInstagramAccount, async (_event, label: string) => {
    const { storageState } = await runInstagramLoginFlow();
    const proxy = getInstagramProxyFromEnv();

    const db = getDb();
    const id = randomUUID();
    db.insert(accounts)
      .values({
        id,
        platform: "instagram",
        label,
        credentials: encryptJson({ storageState }),
        proxy: proxy ? JSON.stringify(proxy) : null,
        createdAt: new Date(),
      })
      .run();

    return { id, label };
  });

  ipcMain.handle(IPC_CHANNELS.listAccounts, async () => {
    const db = getDb();
    const rows = db.select().from(accounts).all();
    return rows.map(toSummary);
  });

  ipcMain.handle(IPC_CHANNELS.deleteAccount, async (_event, accountId: string) => {
    const db = getDb();
    db.delete(accounts).where(eq(accounts.id, accountId)).run();
  });

  ipcMain.handle(
    IPC_CHANNELS.updateAccountProxy,
    async (_event, accountId: string, proxy: unknown) => {
      const parsedProxy = proxy === null ? null : ProxyConfigSchema.parse(proxy);
      const db = getDb();
      db.update(accounts)
        .set({ proxy: parsedProxy ? JSON.stringify(parsedProxy) : null })
        .where(eq(accounts.id, accountId))
        .run();
    },
  );
}
