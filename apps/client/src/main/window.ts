import { BrowserWindow, nativeImage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MainWindowOptions {
  show?: boolean;
  shouldQuit?: () => boolean;
}

function setHiddenFromTaskbar(win: BrowserWindow, hidden: boolean): void {
  if (process.platform === "win32") {
    win.setSkipTaskbar(hidden);
  }
}

export function createMainWindow(options: MainWindowOptions = {}): BrowserWindow {
  const iconCandidates = [
    typeof process.resourcesPath === "string" ? path.join(process.resourcesPath, "icon.png") : "",
    typeof process.resourcesPath === "string" ? path.join(process.resourcesPath, "icon.ico") : "",
    path.join(__dirname, "../../build/icon.png"),
    path.join(__dirname, "../../public/icon.png"),
    path.join(__dirname, "../../dist/icon.png"),
  ].filter(Boolean);
  const iconPath = iconCandidates.find((candidate) => {
    try {
      return nativeImage.createFromPath(candidate).isEmpty() === false;
    } catch {
      return false;
    }
  });

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "ROAD",
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    if (options.show !== false) win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:") || url.startsWith("mailto:")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("Renderer failed to load:", errorCode, errorDescription);
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer] ${message} (${sourceId}:${line})`);
  });
  win.once("ready-to-show", () => {
    if (options.show !== false) {
      setHiddenFromTaskbar(win, false);
      win.show();
    } else {
      setHiddenFromTaskbar(win, true);
    }
  });
  win.on("close", (event) => {
    if (!options.shouldQuit?.()) {
      event.preventDefault();
      win.hide();
      setHiddenFromTaskbar(win, true);
    }
  });

  return win;
}
