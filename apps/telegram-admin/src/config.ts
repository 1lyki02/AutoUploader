import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, "../.env");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Заполните ${name} в apps/telegram-admin/.env (или env хоста)`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizePublicUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** TELEGRAM_WEBAPP_URL, else PUBLIC_URL, else Railway public domain. */
function resolveWebAppUrl(): string | undefined {
  const explicit = optional("TELEGRAM_WEBAPP_URL");
  if (explicit) return normalizePublicUrl(explicit);

  const publicUrl = optional("PUBLIC_URL");
  if (publicUrl) return normalizePublicUrl(publicUrl);

  const railwayDomain = optional("RAILWAY_PUBLIC_DOMAIN");
  if (railwayDomain) return normalizePublicUrl(railwayDomain);

  return undefined;
}

export function loadConfig() {
  const adminIds = required("TELEGRAM_ADMIN_IDS")
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (adminIds.length === 0) {
    throw new Error("TELEGRAM_ADMIN_IDS должен содержать хотя бы один Telegram user id");
  }

  const portRaw = optional("PORT") ?? "8787";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT должен быть числом от 1 до 65535");
  }

  return {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    adminIds: new Set(adminIds),
    licenseAdminUrl: required("SUPABASE_LICENSE_ADMIN_URL").replace(/\/+$/, ""),
    licenseAdminToken: required("LICENSE_ADMIN_TOKEN"),
    webAppUrl: resolveWebAppUrl(),
    port,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
