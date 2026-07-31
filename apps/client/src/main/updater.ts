import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { IPC_CHANNELS, type UpdateStatus } from "./ipc/channels.js";

let targetWindow: BrowserWindow | undefined;
let onBeforeInstall: (() => void) | undefined;

function sendStatus(status: UpdateStatus): void {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  targetWindow.webContents.send(IPC_CHANNELS.updaterStatus, status);
}

export function setUpdaterWindow(window: BrowserWindow | undefined): void {
  targetWindow = window;
}

export function configureUpdater(options: { onBeforeInstall: () => void }): void {
  onBeforeInstall = options.onBeforeInstall;
}

export function initAutoUpdater(window: BrowserWindow): void {
  if (!app.isPackaged) return;

  setUpdaterWindow(window);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    sendStatus({ type: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    sendStatus({ type: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", (info) => {
    sendStatus({ type: "not-available", version: info.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    sendStatus({ type: "progress", percent: progress.percent });
  });
  autoUpdater.on("update-downloaded", (info) => {
    sendStatus({ type: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (error) => {
    sendStatus({ type: "error", message: error.message });
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 10_000);

  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 4 * 60 * 60 * 1000);
}

export function checkForUpdates(): void {
  if (!app.isPackaged) return;
  void autoUpdater.checkForUpdates().catch(() => undefined);
}

export function installUpdate(): void {
  if (!app.isPackaged) return;
  onBeforeInstall?.();
  autoUpdater.quitAndInstall(false, true);
}

export function getAppVersion(): string {
  return app.getVersion();
}
