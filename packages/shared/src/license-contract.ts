import { z } from "zod";

export const LicenseCheckRequestSchema = z.object({
  licenseKey: z.string(),
  machineId: z.string(),
  appVersion: z.string(),
  timestamp: z.string().datetime(),
});
export type LicenseCheckRequest = z.infer<typeof LicenseCheckRequestSchema>;

export const LicenseStatusSchema = z.enum([
  "active",
  "expired",
  "invalid",
  "revoked",
]);
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

export const LicenseCheckResponseSchema = z.object({
  status: LicenseStatusSchema,
  plan: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  gracePeriodDays: z.number().int().nonnegative(),
  serverTime: z.string().datetime(),
});
export type LicenseCheckResponse = z.infer<typeof LicenseCheckResponseSchema>;
