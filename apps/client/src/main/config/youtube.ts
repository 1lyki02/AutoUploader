import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "../secrets/vault.js";

export interface YoutubeOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface YoutubeOAuthClientStatus {
  configured: boolean;
  source: "settings" | "env" | "none";
  clientId: string | null;
  /** Masked secret for UI; never returns the full value. */
  clientSecretMasked: string | null;
}

const SETTINGS_KEY = "youtube.oauthClient";

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

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

function readStoredCredentials(): YoutubeOAuthCredentials | null {
  const raw = setting(SETTINGS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decryptSecret(Buffer.from(raw, "base64"))) as YoutubeOAuthCredentials;
    if (!parsed.clientId?.trim() || !parsed.clientSecret?.trim()) return null;
    return {
      clientId: parsed.clientId.trim(),
      clientSecret: parsed.clientSecret.trim(),
    };
  } catch {
    return null;
  }
}

function readEnvCredentials(): YoutubeOAuthCredentials | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Resolves YouTube OAuth client credentials for this install.
 * Priority: encrypted in-app settings → .env (dev fallback).
 */
export function getYoutubeOAuthCredentials(): YoutubeOAuthCredentials {
  const stored = readStoredCredentials();
  if (stored) return stored;

  const fromEnv = readEnvCredentials();
  if (fromEnv) return fromEnv;

  throw new Error(
    "YouTube API не настроен. Откройте Настройки и укажите Client ID и Client Secret из своего Google Cloud проекта (Desktop OAuth client).",
  );
}

export function getYoutubeOAuthClientStatus(): YoutubeOAuthClientStatus {
  const stored = readStoredCredentials();
  if (stored) {
    return {
      configured: true,
      source: "settings",
      clientId: stored.clientId,
      clientSecretMasked: maskSecret(stored.clientSecret),
    };
  }

  const fromEnv = readEnvCredentials();
  if (fromEnv) {
    return {
      configured: true,
      source: "env",
      clientId: fromEnv.clientId,
      clientSecretMasked: maskSecret(fromEnv.clientSecret),
    };
  }

  return {
    configured: false,
    source: "none",
    clientId: null,
    clientSecretMasked: null,
  };
}

export function setYoutubeOAuthClient(input: {
  clientId: string;
  clientSecret: string;
}): YoutubeOAuthClientStatus {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Укажите и Client ID, и Client Secret");
  }

  setSetting(
    SETTINGS_KEY,
    encryptSecret(JSON.stringify({ clientId, clientSecret })).toString("base64"),
  );
  return getYoutubeOAuthClientStatus();
}

export function clearYoutubeOAuthClient(): YoutubeOAuthClientStatus {
  deleteSetting(SETTINGS_KEY);
  return getYoutubeOAuthClientStatus();
}
