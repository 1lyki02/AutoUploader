import { z } from "zod";

/** Accepts Postgres/Supabase timestamps and normalizes to UTC Z. */
export const IsoDateTimeSchema = z.string().transform((value, ctx) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({ code: "custom", message: "Invalid ISO datetime" });
    return z.NEVER;
  }
  return parsed.toISOString();
});

export const LicenseCheckRequestSchema = z.object({
  licenseKey: z.string(),
  machineId: z.string(),
  appVersion: z.string(),
  timestamp: z.string().datetime(),
});
export type LicenseCheckRequest = z.infer<typeof LicenseCheckRequestSchema>;

export const LicenseStatusSchema = z.enum([
  "unactivated",
  "active",
  "expired",
  "invalid",
  "revoked",
  "already_activated",
  "configuration_error",
]);
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

export const LicenseCheckResponseSchema = z.object({
  status: LicenseStatusSchema,
  plan: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  gracePeriodDays: z.number().int().nonnegative(),
  serverTime: z.string().datetime(),
  entitlementToken: z.string().nullable().default(null),
  message: z.string().nullable().optional(),
});
export type LicenseCheckResponse = z.infer<typeof LicenseCheckResponseSchema>;

export const LicenseEntitlementSchema = z.object({
  iss: z.literal("autouploader-license"),
  sub: z.string().uuid(),
  plan: z.string(),
  installIdHash: z.string().length(64),
  expiresAt: z.string().datetime(),
  offlineUntil: z.string().datetime(),
  iat: z.number().int().nonnegative(),
});
export type LicenseEntitlement = z.infer<typeof LicenseEntitlementSchema>;

export const LicenseClientStateSchema = z.object({
  status: LicenseStatusSchema,
  plan: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  offlineUntil: z.string().datetime().nullable(),
  installId: z.string().uuid(),
  bypass: z.boolean().default(false),
  message: z.string().nullable().optional(),
});
export type LicenseClientState = z.infer<typeof LicenseClientStateSchema>;

export const LicenseAdminSummarySchema = z.object({
  id: z.string().uuid(),
  keyPrefix: z.string(),
  customerName: z.string(),
  customerContact: z.string().nullable(),
  plan: z.string(),
  durationDays: z.number().int().positive(),
  status: z.enum(["unactivated", "active", "expired", "revoked"]),
  activatedAt: IsoDateTimeSchema.nullable(),
  expiresAt: IsoDateTimeSchema.nullable(),
  deviceBound: z.boolean(),
  notes: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type LicenseAdminSummary = z.infer<typeof LicenseAdminSummarySchema>;

export const GenerateLicenseRequestSchema = z.object({
  customerName: z.string().min(1).max(160),
  customerContact: z.string().max(240).optional(),
  plan: z.string().min(1).max(80).default("pro"),
  durationDays: z.number().int().min(1).max(3650),
  notes: z.string().max(2000).optional(),
});
export type GenerateLicenseRequest = z.infer<typeof GenerateLicenseRequestSchema>;

export const GenerateLicenseResponseSchema = z.object({
  license: LicenseAdminSummarySchema,
  licenseKey: z.string(),
});
export type GenerateLicenseResponse = z.infer<typeof GenerateLicenseResponseSchema>;

export const LicenseAdminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("extend"),
    licenseId: z.string().uuid(),
    days: z.number().int().min(1).max(3650),
  }),
  z.object({ action: z.literal("revoke"), licenseId: z.string().uuid() }),
  z.object({ action: z.literal("restore"), licenseId: z.string().uuid() }),
  z.object({ action: z.literal("reset-device"), licenseId: z.string().uuid() }),
]);
export type LicenseAdminAction = z.infer<typeof LicenseAdminActionSchema>;
