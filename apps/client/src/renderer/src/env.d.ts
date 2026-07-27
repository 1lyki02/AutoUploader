export {};

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
      };
      video: {
        pickFile: () => Promise<string | null>;
        uploadToYoutube: (params: UploadYoutubeParams) => Promise<{ videoId: string }>;
        uploadToTiktok: (params: UploadTiktokParams) => Promise<void>;
        uploadToInstagram: (params: UploadInstagramParams) => Promise<void>;
      };
    };
  }
}
