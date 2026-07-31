import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

function parseMasterKey(value: string): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) {
    throw new Error("CREDENTIALS_MASTER_KEY must be a base64-encoded 32-byte key");
  }
  return decoded;
}

export function encryptCredentials(value: unknown, encodedKey: string): string {
  const key = parseMasterKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptCredentials<T>(payload: string, encodedKey: string): T {
  const [version, ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported encrypted credentials format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    parseMasterKey(encodedKey),
    Buffer.from(ivValue, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(tokenHash(left), "hex");
  const b = Buffer.from(tokenHash(right), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
