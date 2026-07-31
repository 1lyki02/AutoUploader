import path from "node:path";
import { createRequire } from "node:module";
import { app } from "electron";
import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
const require = createRequire(import.meta.url);

function loadDatabase(): typeof Database {
  const moduleId = app.isPackaged
    ? path.join(process.resourcesPath, "vendor", "better-sqlite3")
    : "better-sqlite3";
  return require(moduleId) as typeof Database;
}

function ensureColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (dbInstance) return dbInstance;

  const dbPath = path.join(app.getPath("userData"), "autouploader.db");
  const Database = loadDatabase();
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      label TEXT NOT NULL,
      credentials BLOB NOT NULL,
      proxy TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      title TEXT,
      description TEXT,
      privacy_status TEXT NOT NULL DEFAULT 'private',
      added_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      video_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      transform_params TEXT,
      executed_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureColumn(sqlite, "videos", "description", "TEXT");
  ensureColumn(sqlite, "videos", "privacy_status", "TEXT NOT NULL DEFAULT 'private'");
  ensureColumn(sqlite, "jobs", "updated_at", "INTEGER");
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS jobs_status_scheduled_idx ON jobs(status, scheduled_at)",
  );

  // A process may have stopped after publishing but before recording success.
  // Do not retry these jobs automatically because that could create duplicates.
  sqlite
    .prepare(
      `UPDATE jobs
       SET status = 'failed',
           last_error = 'Приложение было закрыто во время загрузки. Проверьте платформу перед ручным повтором.',
           updated_at = unixepoch()
       WHERE status = 'running'`,
    )
    .run();

  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}
