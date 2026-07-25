import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

/**
 * `credentials` holds an encrypted (Electron safeStorage) JSON blob whose shape depends
 * on `platform`: YouTube stores { refreshToken }, TikTok/Instagram will store a
 * Playwright storageState once those platforms are implemented (Phase 3/4).
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(),
  label: text("label").notNull(),
  credentials: blob("credentials", { mode: "buffer" }).notNull(),
  proxy: text("proxy"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;

export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  title: text("title"),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
});

export type VideoRow = typeof videos.$inferSelect;
export type NewVideoRow = typeof videos.$inferInsert;

/**
 * `transformParams` is a JSON-encoded TransformParams (see packages/shared) — the
 * randomization actually applied to this attempt, logged for debuggability once the
 * anti-duplicate pipeline (Phase 5) exists. `executedBy` distinguishes a client-run
 * upload from a server fallback run (Phase 7).
 */
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  videoId: text("video_id").notNull(),
  platform: text("platform").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  transformParams: text("transform_params"),
  executedBy: text("executed_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;

/** Generic key-value store for app-wide settings (default proxy, UI prefs, etc.). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type SettingRow = typeof settings.$inferSelect;
