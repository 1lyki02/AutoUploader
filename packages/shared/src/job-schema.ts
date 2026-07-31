import { z } from "zod";
import { PlatformSchema } from "./platforms.js";

export const JobStatusSchema = z.enum([
  "pending",
  "running",
  "done",
  "failed",
  "missed",
  "needs_review",
  "reauth_required",
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

export const PrivacyStatusSchema = z.enum(["private", "unlisted", "public"]);
export type PrivacyStatus = z.infer<typeof PrivacyStatusSchema>;

export const BatchVideoInputSchema = z.object({
  filePath: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  privacyStatus: PrivacyStatusSchema.default("private"),
});
export type BatchVideoInput = z.infer<typeof BatchVideoInputSchema>;

export const CreateUploadBatchSchema = z.object({
  accountIds: z.array(z.string().min(1)).min(1),
  videos: z.array(BatchVideoInputSchema).min(1),
  scheduledAt: z.string().datetime().optional(),
});
export type CreateUploadBatch = z.infer<typeof CreateUploadBatchSchema>;

export const UploadJobSummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountLabel: z.string(),
  platform: PlatformSchema,
  videoId: z.string(),
  filePath: z.string(),
  title: z.string(),
  status: JobStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  scheduledAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UploadJobSummary = z.infer<typeof UploadJobSummarySchema>;

export const UploadTransferProgressSchema = z.object({
  fileName: z.string(),
  fileIndex: z.number().int().nonnegative(),
  fileCount: z.number().int().positive(),
  uploadedBytes: z.number().nonnegative(),
  totalBytes: z.number().positive(),
  percent: z.number().min(0).max(100),
});
export type UploadTransferProgress = z.infer<typeof UploadTransferProgressSchema>;
