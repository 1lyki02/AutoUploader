export const IPC_CHANNELS = {
  ping: "app:ping",
  connectYoutubeAccount: "accounts:connect-youtube",
  connectTiktokAccount: "accounts:connect-tiktok",
  listAccounts: "accounts:list",
  deleteAccount: "accounts:delete",
  updateAccountProxy: "accounts:update-proxy",
  pickVideoFile: "video:pick",
  uploadToYoutube: "video:upload-youtube",
  prepareTiktokUpload: "video:prepare-tiktok",
} as const;
