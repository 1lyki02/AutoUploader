export const IPC_CHANNELS = {
  ping: "app:ping",
  connectYoutubeAccount: "accounts:connect-youtube",
  listAccounts: "accounts:list",
  deleteAccount: "accounts:delete",
  updateAccountProxy: "accounts:update-proxy",
  pickVideoFile: "video:pick",
  uploadToYoutube: "video:upload-youtube",
} as const;
