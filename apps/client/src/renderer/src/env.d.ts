import type {
  CreateUploadBatch,
  UploadJobSummary,
  UploadTransferProgress,
  LicenseClientState,
} from "@autouploader/shared";

export {};
export type { CreateUploadBatch, UploadJobSummary, UploadTransferProgress, LicenseClientState };

declare module "*.png" {
  const src: string;
  export default src;
}

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface AccountSummary {
  id: string;
  platform: string;
  label: string;
  proxy: ProxyConfig | null;
  createdAt: string;
}

export interface UploadYoutubeParams {
  accountId: string;
  filePath: string;
  title: string;
  description?: string;
  privacyStatus?: "private" | "unlisted" | "public";
}

export interface UploadTiktokParams {
  accountId: string;
  filePath: string;
  caption?: string;
}

export interface UploadInstagramParams {
  accountId: string;
  filePath: string;
  caption?: string;
}

export type UpdateStatus =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available"; version: string }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

declare global {
  interface Window {
    api: {
      ping: () => Promise<string>;
      accounts: {
        connectYoutube: (label: string) => Promise<{ id: string; label: string }>;
        connectTiktok: (label: string) => Promise<{ id: string; label: string }>;
        connectInstagram: (label: string) => Promise<{ id: string; label: string }>;
        list: () => Promise<AccountSummary[]>;
        delete: (accountId: string) => Promise<void>;
        updateProxy: (accountId: string, proxy: ProxyConfig | null) => Promise<void>;
        updateLabel: (accountId: string, label: string) => Promise<void>;
      };
      video: {
        pickFile: () => Promise<string | null>;
        pickFiles: () => Promise<string[]>;
        uploadToYoutube: (params: UploadYoutubeParams) => Promise<{ videoId: string }>;
        uploadToTiktok: (params: UploadTiktokParams) => Promise<void>;
        uploadToInstagram: (params: UploadInstagramParams) => Promise<void>;
      };
      jobs: {
        createBatch: (request: CreateUploadBatch) => Promise<UploadJobSummary[]>;
        list: () => Promise<UploadJobSummary[]>;
        retry: (jobId: string) => Promise<UploadJobSummary>;
        cancel: (jobId: string) => Promise<UploadJobSummary>;
        onProgress: (callback: (job: UploadJobSummary) => void) => () => void;
        onUploadProgress: (callback: (progress: UploadTransferProgress) => void) => () => void;
      };
      license: {
        status: () => Promise<LicenseClientState>;
        activate: (key: string) => Promise<LicenseClientState>;
        refresh: () => Promise<LicenseClientState>;
        deactivate: () => Promise<LicenseClientState>;
      };
      youtube: {
        getOAuthClient: () => Promise<{
          configured: boolean;
          source: "settings" | "env" | "none";
          clientId: string | null;
          clientSecretMasked: string | null;
        }>;
        setOAuthClient: (input: {
          clientId: string;
          clientSecret: string;
        }) => Promise<{
          configured: boolean;
          source: "settings" | "env" | "none";
          clientId: string | null;
          clientSecretMasked: string | null;
        }>;
        clearOAuthClient: () => Promise<{
          configured: boolean;
          source: "settings" | "env" | "none";
          clientId: string | null;
          clientSecretMasked: string | null;
        }>;
      };
      updater: {
        version: () => Promise<string>;
        check: () => Promise<void>;
        install: () => Promise<void>;
        onStatus: (callback: (status: UpdateStatus) => void) => () => void;
      };
    };
  }
}
