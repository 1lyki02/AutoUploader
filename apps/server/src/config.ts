import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  SERVER_API_TOKEN: z.string().min(24),
  SERVER_USER_ID: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
  SERVER_DEVICE_ID: z.string().uuid().default("00000000-0000-0000-0000-000000000002"),
  CREDENTIALS_MASTER_KEY: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_REGION: z.string().default("auto"),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  WORKER_ENABLED: z.string().default("true").transform((value) => value === "true"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(8).default(2),
  VIDEO_RETENTION_HOURS: z.coerce.number().int().positive().default(48),
  UPLOAD_RETENTION_HOURS: z.coerce.number().int().positive().default(168),
  LEASE_SECONDS: z.coerce.number().int().min(60).default(900),
});

export type ServerConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  return ConfigSchema.parse(environment);
}
