import path from "node:path";
import { appendFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  Tray,
  type NativeImage,
} from "electron";
import dotenv from "dotenv";
import { createMainWindow } from "./window.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let quitting = false;
let stopScheduler: (() => void) | undefined;
const startupLogPath = path.join(os.tmpdir(), "autouploader-startup.log");

function startupLog(message: string): void {
  appendFileSync(startupLogPath, `${new Date().toISOString()} ${message}\n`, "utf8");
}

writeFileSync(startupLogPath, "", "utf8");
startupLog("main module loaded");

function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, "../../build/icon.png"),
    path.join(__dirname, "../../public/icon.png"),
    path.join(__dirname, "../../dist/icon.png"),
    path.join(process.resourcesPath, "app.asar.unpacked", "build", "icon.png"),
    path.join(app.getAppPath(), "build", "icon.png"),
    path.join(app.getAppPath(), "dist", "icon.png"),
  ];
  for (const candidate of candidates) {
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return candidate;
  }
  return undefined;
}

function trayIcon(): NativeImage {
  const iconPath = resolveAppIconPath();
  if (iconPath) {
    return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  }

  const size = 16;
  const bitmap = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const inside = x >= 2 && x <= 13 && y >= 2 && y <= 13;
      const center = x >= 6 && x <= 9 && y >= 5 && y <= 11;
      bitmap[index] = center ? 255 : inside ? 75 : 0;
      bitmap[index + 1] = center ? 197 : inside ? 60 : 0;
      bitmap[index + 2] = center ? 66 : inside ? 207 : 0;
      bitmap[index + 3] = inside || center ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow({ show: true, shouldQuit: () => quitting });
    void import("./updater.js").then(({ setUpdaterWindow }) => setUpdaterWindow(mainWindow));
    return;
  }
  if (process.platform === "win32") mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  if (tray) return;
  tray = new Tray(trayIcon());
  tray.setToolTip("ROAD — публикации по расписанию");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Открыть ROAD", click: showMainWindow },
      ...(app.isPackaged
        ? [{
            label: "Проверить обновления",
            click: () => {
              void import("./updater.js").then(({ checkForUpdates }) => checkForUpdates());
            },
          }]
        : []),
      { type: "separator" },
      {
        label: "Выйти полностью",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", showMainWindow);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  app.whenReady().then(async () => {
    startupLog("electron ready");
    const [
      { registerPingHandler },
      { registerAccountsHandlers },
      { registerVideoHandlers },
      { registerLicenseHandlers },
      { registerYoutubeHandlers },
      { registerUpdaterHandlers },
      { getUploadScheduler },
      { getLicenseService },
      { configureUpdater, initAutoUpdater },
    ] = await Promise.all([
      import("./ipc/handlers/ping.js"),
      import("./ipc/handlers/accounts.js"),
      import("./ipc/handlers/video.js"),
      import("./ipc/handlers/license.js"),
      import("./ipc/handlers/youtube.js"),
      import("./ipc/handlers/updater.js"),
      import("./jobs/scheduler.js"),
      import("./license/service.js"),
      import("./updater.js"),
    ]);
    startupLog("main modules imported");
    registerPingHandler();
    registerAccountsHandlers();
    registerVideoHandlers();
    registerLicenseHandlers();
    registerYoutubeHandlers();
    registerUpdaterHandlers();
    configureUpdater({ onBeforeInstall: () => { quitting = true; } });
    await getLicenseService().initialize();
    stopScheduler = () => getUploadScheduler().stop();
    startupLog("ipc and scheduler started");

    const background = process.argv.includes("--background");
    mainWindow = createMainWindow({ show: !background, shouldQuit: () => quitting });
    createTray();
    initAutoUpdater(mainWindow);

    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: ["--background"],
        ...(process.platform === "darwin" ? { openAsHidden: true } : {}),
      });
    }
    startupLog("window, tray and autostart ready");
  }).catch((error: unknown) => {
    startupLog(`startup failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    app.quit();
  });

  app.on("activate", showMainWindow);

  // Closing the window hides it to the tray so scheduled jobs keep running.
  app.on("window-all-closed", () => undefined);

  app.on("before-quit", () => {
    quitting = true;
    stopScheduler?.();
    tray?.destroy();
    tray = undefined;
  });
}
