export const IPC_CHANNELS = {
  ping: "app:ping",
  connectYoutubeAccount: "accounts:connect-youtube",
  connectTiktokAccount: "accounts:connect-tiktok",
  connectInstagramAccount: "accounts:connect-instagram",
  listAccounts: "accounts:list",
  deleteAccount: "accounts:delete",
  updateAccountProxy: "accounts:update-proxy",
  pickVideoFile: "video:pick",
  uploadToYoutube: "video:upload-youtube",
  uploadToTiktok: "video:upload-tiktok",
  uploadToInstagram: "video:upload-instagram",
} as const;
