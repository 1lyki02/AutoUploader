import { z } from "zod";
import { PlatformSchema } from "./platforms.js";

export const JobStatusSchema = z.enum([
  "pending",
  "running",
  "done",
  "failed",
  "missed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const ProxyConfigSchema = z.object({
  server: z.string(),
  username: z.string().optional(),
  password: z.string().optional(),
});
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

/** Randomization parameters actually applied to a given upload attempt, logged for debuggability. */
export const TransformParamsSchema = z.object({
  cropLeft: z.number(),
  cropRight: z.number(),
  cropTop: z.number(),
  cropBottom: z.number(),
  brightness: z.number(),
  contrast: z.number(),
  saturation: z.number(),
  speed: z.number(),
});
export type TransformParams = z.infer<typeof TransformParamsSchema>;

export const JobSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  platform: PlatformSchema,
  sourceVideoId: z.string(),
  scheduledAt: z.string().datetime(),
  status: JobStatusSchema,
  attempts: z.number().int().nonnegative().default(0),
  lastError: z.string().nullable().optional(),
  transformParams: TransformParamsSchema.nullable().optional(),
  executedBy: z.enum(["client", "server"]).nullable().optional(),
});
export type Job = z.infer<typeof JobSchema>;
