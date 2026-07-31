import { ipcMain } from "electron";
import {
  clearYoutubeOAuthClient,
  getYoutubeOAuthClientStatus,
  setYoutubeOAuthClient,
} from "../../config/youtube.js";
import { IPC_CHANNELS } from "../channels.js";

export function registerYoutubeHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.youtubeGetOAuthClient, () => getYoutubeOAuthClientStatus());

  ipcMain.handle(
    IPC_CHANNELS.youtubeSetOAuthClient,
    (_event, input: { clientId: string; clientSecret: string }) => setYoutubeOAuthClient(input),
  );

  ipcMain.handle(IPC_CHANNELS.youtubeClearOAuthClient, () => clearYoutubeOAuthClient());
}
