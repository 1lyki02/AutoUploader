import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AUTH_AGE_SEC = 60 * 60 * 24; // 24h

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface ValidatedInitData {
  user: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Validates Telegram Mini App `initData` per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  options?: { maxAgeSec?: number; nowSec?: number },
): ValidatedInitData {
  if (!initData?.trim()) {
    throw new Error("Отсутствуют данные Telegram WebApp (initData)");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("В initData нет hash");
  }

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!safeEqualHex(calculated, hash)) {
    throw new Error("Подпись initData недействительна");
  }

  const authDateRaw = params.get("auth_date");
  const authDate = Number(authDateRaw);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new Error("Некорректный auth_date");
  }

  const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);
  const maxAge = options?.maxAgeSec ?? MAX_AUTH_AGE_SEC;
  if (nowSec - authDate > maxAge) {
    throw new Error("Сессия Telegram устарела — переоткрой Mini App");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new Error("В initData нет user");
  }

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new Error("Не удалось разобрать user из initData");
  }

  if (!Number.isInteger(user.id) || user.id <= 0) {
    throw new Error("Некорректный user.id");
  }

  return {
    user,
    authDate,
    queryId: params.get("query_id") ?? undefined,
  };
}

export function assertAdminUser(
  userId: number,
  adminIds: ReadonlySet<number>,
): void {
  if (!adminIds.has(userId)) {
    throw new Error("Доступ только для администраторов");
  }
}
