import postgres from "postgres";
import type { ServerConfig } from "./config.js";
import { migrations } from "./schema.js";
import { tokenHash } from "./secrets.js";

export type Database = ReturnType<typeof postgres>;

export function createDatabase(config: ServerConfig): Database {
  return postgres(config.DATABASE_URL, {
    max: Math.max(4, config.WORKER_CONCURRENCY + 2),
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

export async function migrateDatabase(sql: Database, config: ServerConfig): Promise<void> {
  for (const migration of migrations) {
    await sql.unsafe(migration);
  }

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO users (id, name)
      VALUES (${config.SERVER_USER_ID}, 'Default user')
      ON CONFLICT (id) DO NOTHING
    `;
    await tx`
      INSERT INTO devices (id, user_id, label, token_hash)
      VALUES (
        ${config.SERVER_DEVICE_ID},
        ${config.SERVER_USER_ID},
        'Desktop client',
        ${tokenHash(config.SERVER_API_TOKEN)}
      )
      ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash
    `;
  });
}
