import type {
  GenerateLicenseRequest,
  GenerateLicenseResponse,
  LicenseAdminAction,
  LicenseAdminSummary,
} from "@autouploader/shared";

export {};

declare global {
  interface Window {
    adminApi: {
      list: () => Promise<LicenseAdminSummary[]>;
      generate: (input: GenerateLicenseRequest) => Promise<GenerateLicenseResponse>;
      action: (input: LicenseAdminAction) => Promise<LicenseAdminSummary>;
      events: (licenseId: string) => Promise<unknown[]>;
    };
  }
}
