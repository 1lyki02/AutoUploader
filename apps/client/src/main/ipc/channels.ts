export const IPC_CHANNELS = {
  ping: "app:ping",
  connectYoutubeAccount: "accounts:connect-youtube",
  connectTiktokAccount: "accounts:connect-tiktok",
  connectInstagramAccount: "accounts:connect-instagram",
  listAccounts: "accounts:list",
  deleteAccount: "accounts:delete",
  updateAccountProxy: "accounts:update-proxy",
  pickVideoFile: "video:pick",
  pickVideoFiles: "video:pick-many",
  uploadToYoutube: "video:upload-youtube",
  uploadToTiktok: "video:upload-tiktok",
  uploadToInstagram: "video:upload-instagram",
  createUploadBatch: "jobs:create-batch",
  listUploadJobs: "jobs:list",
  retryUploadJob: "jobs:retry",
  uploadJobProgress: "jobs:progress",
  uploadTransferProgress: "jobs:upload-progress",
  licenseStatus: "license:status",
  licenseActivate: "license:activate",
  licenseRefresh: "license:refresh",
  licenseDeactivate: "license:deactivate",
  youtubeGetOAuthClient: "youtube:get-oauth-client",
  youtubeSetOAuthClient: "youtube:set-oauth-client",
  youtubeClearOAuthClient: "youtube:clear-oauth-client",
  updaterStatus: "updater:status",
  updaterVersion: "updater:version",
  updaterCheck: "updater:check",
  updaterInstall: "updater:install",
} as const;

export type UpdateStatus =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available"; version: string }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };
