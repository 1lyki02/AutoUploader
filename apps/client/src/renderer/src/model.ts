export type PrivacyStatus = "private" | "unlisted" | "public";

export interface VideoDraft {
  id: string;
  filePath: string;
  title: string;
  description: string;
  privacyStatus: PrivacyStatus | "";
}
