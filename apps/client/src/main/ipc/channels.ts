export const IPC_CHANNELS = {
  ping: "app:ping",
  connectYoutubeAccount: "accounts:connect-youtube",
  listAccounts: "accounts:list",
  pickVideoFile: "video:pick",
  uploadToYoutube: "video:upload-youtube",
} as const;
