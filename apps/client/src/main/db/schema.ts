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
