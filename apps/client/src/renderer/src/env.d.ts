export {};

export interface AccountSummary {
  id: string;
  platform: string;
  label: string;
  proxy: string | null;
  createdAt: string;
}

export interface UploadYoutubeParams {
  accountId: string;
  filePath: string;
  title: string;
  description?: string;
  privacyStatus?: "private" | "unlisted" | "public";
}

declare global {
  interface Window {
    api: {
      ping: () => Promise<string>;
      accounts: {
        connectYoutube: (label: string) => Promise<{ id: string; label: string }>;
        list: () => Promise<AccountSummary[]>;
      };
      video: {
        pickFile: () => Promise<string | null>;
        uploadToYoutube: (params: UploadYoutubeParams) => Promise<{ videoId: string }>;
      };
    };
  }
}
