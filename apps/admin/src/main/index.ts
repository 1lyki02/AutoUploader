import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import dotenv from "dotenv";
import {
  GenerateLicenseRequestSchema,
  LicenseAdminActionSchema,
  LicenseAdminSummarySchema,
  GenerateLicenseResponseSchema,
} from "@autouploader/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: app.isPackaged
    ? path.join(path.dirname(process.execPath), ".env")
    : path.join(__dirname, "../../.env"),
});

function adminConfig(): { url: string; token: string } {
  const url = process.env.SUPABASE_LICENSE_ADMIN_URL?.replace(/\/+$/, "");
  const token = process.env.LICENSE_ADMIN_TOKEN;
  if (!url || !token) {
    throw new Error("Заполните SUPABASE_LICENSE_ADMIN_URL и LICENSE_ADMIN_TOKEN в apps/admin/.env");
  }
  return { url, token };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function networkErrorMessage(error: unknown): string {
  const cause = error instanceof Error && "cause" in error
    ? (error as { cause?: { code?: string; message?: string } }).cause
    : undefined;
  const code = cause?.code ?? "";
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND" ||
    (error instanceof Error && /fetch failed/i.test(error.message))) {
    return "Нет стабильного соединения с Supabase. Отключите VPN/прокси и нажмите «Обновить», затем повторите.";
  }
  return error instanceof Error ? error.message : String(error);
}

async function adminRequest<T>(query = "", init: RequestInit = {}): Promise<T> {
  const config = adminConfig();
  const headers = new Headers(init.headers);
  headers.set("x-admin-token", config.token);
  if (init.body) headers.set("Content-Type", "application/json");

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${config.url}${query}`, { ...init, headers });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Ошибка сервиса лицензий (${response.status})`);
      }
      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 700);
    }
  }
  throw new Error(networkErrorMessage(lastError));
}

function registerHandlers(): void {
  ipcMain.handle("licenses:list", async () => {
    const rows = await adminRequest<unknown[]>();
    return rows.map((row) => LicenseAdminSummarySchema.parse(row));
  });
  ipcMain.handle("licenses:generate", async (_event, input: unknown) => {
    const request = GenerateLicenseRequestSchema.parse(input);
    return GenerateLicenseResponseSchema.parse(await adminRequest("", {
      method: "POST",
      body: JSON.stringify({ action: "generate", ...request }),
    }));
  });
  ipcMain.handle("licenses:action", async (_event, input: unknown) => {
    const request = LicenseAdminActionSchema.parse(input);
    return LicenseAdminSummarySchema.parse(await adminRequest("", {
      method: "POST",
      body: JSON.stringify(request),
    }));
  });
  ipcMain.handle("licenses:events", async (_event, licenseId: string) =>
    adminRequest(`?events=${encodeURIComponent(licenseId)}`));
}

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, "../preload/index.cjs"),
    path.join(__dirname, "../preload/index.js"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Admin preload not found. Looked in: ${candidates.join(", ")}`);
  }
  return found;
}

function createWindow(): void {
  const preload = resolvePreloadPath();
  console.log(`[admin] using preload: ${preload}`);

  const window = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 980,
    minHeight: 650,
    title: "ROAD License Admin",
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`Admin window failed to load (${code}): ${description}`);
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Admin preload failed (${preloadPath}):`, error);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

app.whenReady().then(() => {
  registerHandlers();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
