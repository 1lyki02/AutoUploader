import { randomUUID, type JsonWebKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { eq } from "drizzle-orm";
import {
  LicenseCheckResponseSchema,
  type LicenseClientState,
} from "@autouploader/shared";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "../secrets/vault.js";
import {
  entitlementIsUsable,
  licenseAllowsPublishing,
  verifyEntitlementToken,
} from "./entitlement.js";

const INSTALL_ID_KEY = "license.installId";
const LICENSE_KEY_KEY = "license.encryptedKey";
const TOKEN_KEY = "license.encryptedEntitlement";

function setting(key: string): string | undefined {
  return getDb().select().from(settings).where(eq(settings.key, key)).get()?.value;
}

function setSetting(key: string, value: string): void {
  getDb().insert(settings).values({ key, value }).onConflictDoUpdate({
    target: settings.key,
    set: { value },
  }).run();
}

function deleteSetting(key: string): void {
  getDb().delete(settings).where(eq(settings.key, key)).run();
}

function encryptedSetting(key: string): string | undefined {
  const value = setting(key);
  return value ? decryptSecret(Buffer.from(value, "base64")) : undefined;
}

function setEncryptedSetting(key: string, value: string): void {
  setSetting(key, encryptSecret(value).toString("base64"));
}

function getOrCreateInstallId(): string {
  const existing = setting(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = randomUUID();
  setSetting(INSTALL_ID_KEY, id);
  return id;
}

interface LicenseConfig {
  apiUrl: string;
  publicJwk: JsonWebKey;
}

function loadLicenseConfig(): LicenseConfig | undefined {
  let apiUrl = process.env.SUPABASE_LICENSE_URL?.trim();
  let publicJwkValue = process.env.LICENSE_SIGNING_PUBLIC_JWK?.trim();
  const configPath = app.isPackaged
    ? path.join(process.resourcesPath, "license.config.json")
    : path.join(app.getAppPath(), "license.config.json");
  if ((!apiUrl || !publicJwkValue) && existsSync(configPath)) {
    const fileConfig = JSON.parse(readFileSync(configPath, "utf8")) as {
      apiUrl?: string;
      publicJwk?: JsonWebKey;
    };
    apiUrl ||= fileConfig.apiUrl?.trim();
    if (!publicJwkValue && fileConfig.publicJwk) {
      publicJwkValue = JSON.stringify(fileConfig.publicJwk);
    }
  }
  if (!apiUrl || !publicJwkValue) return undefined;
  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    publicJwk: JSON.parse(publicJwkValue) as JsonWebKey,
  };
}

export class LicenseService {
  private readonly installId = getOrCreateInstallId();
  private readonly config = loadLicenseConfig();
  private state?: LicenseClientState;

  async initialize(): Promise<LicenseClientState> {
    return this.refresh();
  }

  getState(): LicenseClientState {
    return this.state ?? {
      status: "unactivated",
      plan: null,
      expiresAt: null,
      offlineUntil: null,
      installId: this.installId,
      bypass: false,
    };
  }

  async activate(licenseKey: string): Promise<LicenseClientState> {
    const normalized = licenseKey.trim().toUpperCase();
    if (!normalized) throw new Error("Введите лицензионный ключ");
    if (!this.config) return this.configurationState();
    const response = await this.request(normalized);
    if (response.status === "active" && response.entitlementToken) {
      verifyEntitlementToken(response.entitlementToken, this.config.publicJwk, this.installId);
      setEncryptedSetting(LICENSE_KEY_KEY, normalized);
      setEncryptedSetting(TOKEN_KEY, response.entitlementToken);
    } else {
      deleteSetting(TOKEN_KEY);
    }
    this.state = {
      status: response.status,
      plan: response.plan,
      expiresAt: response.expiresAt,
      offlineUntil: response.entitlementToken
        ? verifyEntitlementToken(
            response.entitlementToken,
            this.config.publicJwk,
            this.installId,
          ).offlineUntil
        : null,
      installId: this.installId,
      bypass: false,
      message: response.message ?? null,
    };
    return this.state;
  }

  async refresh(): Promise<LicenseClientState> {
    if (!this.config) return this.configurationState();
    const key = encryptedSetting(LICENSE_KEY_KEY);
    if (!key) {
      this.state = {
        status: "unactivated",
        plan: null,
        expiresAt: null,
        offlineUntil: null,
        installId: this.installId,
        bypass: false,
      };
      return this.state;
    }

    try {
      return await this.activate(key);
    } catch (error) {
      const cached = encryptedSetting(TOKEN_KEY);
      if (cached) {
        try {
          const entitlement = verifyEntitlementToken(
            cached,
            this.config.publicJwk,
            this.installId,
          );
          if (entitlementIsUsable(entitlement)) {
            this.state = {
              status: "active",
              plan: entitlement.plan,
              expiresAt: entitlement.expiresAt,
              offlineUntil: entitlement.offlineUntil,
              installId: this.installId,
              bypass: false,
              message: "Офлайн-режим: проверка сервера временно недоступна",
            };
            return this.state;
          }
        } catch {
          deleteSetting(TOKEN_KEY);
        }
      }
      this.state = {
        status: "invalid",
        plan: null,
        expiresAt: null,
        offlineUntil: null,
        installId: this.installId,
        bypass: false,
        message: error instanceof Error ? error.message : String(error),
      };
      return this.state;
    }
  }

  deactivate(): LicenseClientState {
    deleteSetting(LICENSE_KEY_KEY);
    deleteSetting(TOKEN_KEY);
    this.state = {
      status: "unactivated",
      plan: null,
      expiresAt: null,
      offlineUntil: null,
      installId: this.installId,
      bypass: false,
    };
    return this.state;
  }

  async assertCanPublish(): Promise<void> {
    let state = this.getState();
    if (state.status === "active" && !licenseAllowsPublishing(state)) {
      state = await this.refresh();
    }
    if (!licenseAllowsPublishing(state)) {
      throw new Error("Для создания публикации нужна активная лицензия");
    }
  }

  private configurationState(): LicenseClientState {
    if (!app.isPackaged) {
      this.state = {
        status: "active",
        plan: "development",
        expiresAt: "2999-12-31T23:59:59.000Z",
        offlineUntil: "2999-12-31T23:59:59.000Z",
        installId: this.installId,
        bypass: true,
        message: "Development bypass: сервис лицензий не настроен",
      };
      return this.state;
    }
    this.state = {
      status: "configuration_error",
      plan: null,
      expiresAt: null,
      offlineUntil: null,
      installId: this.installId,
      bypass: false,
      message: "В сборке не настроен сервис лицензий",
    };
    return this.state;
  }

  private async request(licenseKey: string) {
    if (!this.config) throw new Error("Сервис лицензий не настроен");
    const response = await fetch(this.config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseKey,
        machineId: this.installId,
        appVersion: app.getVersion(),
        timestamp: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Ошибка проверки лицензии (${response.status})`);
    }
    return LicenseCheckResponseSchema.parse(await response.json());
  }
}

let licenseService: LicenseService | undefined;

export function getLicenseService(): LicenseService {
  licenseService ??= new LicenseService();
  return licenseService;
}
