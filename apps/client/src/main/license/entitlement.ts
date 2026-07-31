import {
  createHash,
  createPublicKey,
  verify,
  type JsonWebKey,
} from "node:crypto";
import {
  LicenseEntitlementSchema,
  type LicenseClientState,
  type LicenseEntitlement,
} from "@autouploader/shared";

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function hashInstallId(installId: string): string {
  return createHash("sha256").update(installId).digest("hex");
}

export function verifyEntitlementToken(
  token: string,
  publicJwk: JsonWebKey,
  installId: string,
): LicenseEntitlement {
  const [headerValue, payloadValue, signatureValue] = token.split(".");
  if (!headerValue || !payloadValue || !signatureValue) {
    throw new Error("Некорректный формат токена лицензии");
  }
  const header = JSON.parse(decodeBase64Url(headerValue).toString("utf8")) as {
    alg?: string;
  };
  if (header.alg !== "EdDSA") throw new Error("Неподдерживаемая подпись лицензии");
  const publicKey = createPublicKey({ key: publicJwk, format: "jwk" });
  const valid = verify(
    null,
    Buffer.from(`${headerValue}.${payloadValue}`),
    publicKey,
    decodeBase64Url(signatureValue),
  );
  if (!valid) throw new Error("Подпись лицензии недействительна");
  const payload = LicenseEntitlementSchema.parse(
    JSON.parse(decodeBase64Url(payloadValue).toString("utf8")),
  );
  if (payload.installIdHash !== hashInstallId(installId)) {
    throw new Error("Лицензия выпущена для другой установки");
  }
  return payload;
}

export function entitlementIsUsable(
  entitlement: LicenseEntitlement,
  now = new Date(),
): boolean {
  const timestamp = now.getTime();
  return new Date(entitlement.expiresAt).getTime() > timestamp &&
    new Date(entitlement.offlineUntil).getTime() > timestamp;
}

export function licenseAllowsPublishing(
  state: LicenseClientState,
  now = new Date(),
): boolean {
  if (state.status !== "active" || !state.expiresAt || !state.offlineUntil) return false;
  const timestamp = now.getTime();
  return new Date(state.expiresAt).getTime() > timestamp &&
    new Date(state.offlineUntil).getTime() > timestamp;
}
