import { randomUUID } from "node:crypto";
import { ipcMain, shell } from "electron";
import { runYouTubeLoginFlow } from "@autouploader/automation";
import { getYoutubeOAuthCredentials } from "../../config/youtube.js";
import { getDb } from "../../db/client.js";
import { accounts, type AccountRow } from "../../db/schema.js";
import { encryptJson } from "../../secrets/vault.js";
import { IPC_CHANNELS } from "../channels.js";

export interface AccountSummary {
  id: string;
  platform: string;
  label: string;
  proxy: string | null;
  createdAt: string;
}

function toSummary(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    platform: row.platform,
    label: row.label,
    proxy: row.proxy,
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

  ipcMain.handle(IPC_CHANNELS.listAccounts, async () => {
    const db = getDb();
    const rows = db.select().from(accounts).all();
    return rows.map(toSummary);
  });
}
