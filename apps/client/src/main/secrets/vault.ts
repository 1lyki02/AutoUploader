import { safeStorage } from "electron";

export function isVaultAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function encryptSecret(plaintext: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "OS-level шифрование недоступно на этой машине — safeStorage не может защитить секреты",
    );
  }
  return safeStorage.encryptString(plaintext);
}

export function decryptSecret(encrypted: Buffer): string {
  return safeStorage.decryptString(encrypted);
}

export function encryptJson(value: unknown): Buffer {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(encrypted: Buffer): T {
  return JSON.parse(decryptSecret(encrypted)) as T;
}
