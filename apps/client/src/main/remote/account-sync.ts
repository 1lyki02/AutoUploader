import { PlatformSchema, type ProxyConfig } from "@autouploader/shared";
import type { AccountRow } from "../db/schema.js";
import { decryptJson } from "../secrets/vault.js";
import { getServerApi } from "./server-api.js";

export async function syncAccountToServer(account: AccountRow): Promise<void> {
  const server = getServerApi();
  if (!server) return;
  await server.syncAccount({
    id: account.id,
    platform: PlatformSchema.parse(account.platform),
    label: account.label,
    credentials: decryptJson<Record<string, unknown>>(account.credentials),
    proxy: account.proxy ? (JSON.parse(account.proxy) as ProxyConfig) : null,
  });
}
