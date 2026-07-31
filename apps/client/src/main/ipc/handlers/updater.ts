import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../channels.js";
import { checkForUpdates, getAppVersion, installUpdate } from "../../updater.js";

export function registerUpdaterHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.updaterVersion, () => getAppVersion());
  ipcMain.handle(IPC_CHANNELS.updaterCheck, () => {
    checkForUpdates();
  });
  ipcMain.handle(IPC_CHANNELS.updaterInstall, () => {
    installUpdate();
  });
}
