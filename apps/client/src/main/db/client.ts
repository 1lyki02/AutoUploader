import path from "node:path";
import { app } from "electron";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (dbInstance) return dbInstance;

  const dbPath = path.join(app.getPath("userData"), "autouploader.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      label TEXT NOT NULL,
      credentials BLOB NOT NULL,
      proxy TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}
