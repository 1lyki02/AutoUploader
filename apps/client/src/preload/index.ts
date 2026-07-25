import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../main/ipc/channels.js";

contextBridge.exposeInMainWorld("api", {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),
  accounts: {
    connectYoutube: (label: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.connectYoutubeAccount, label),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.listAccounts),
  },
  video: {
    pickFile: () => ipcRenderer.invoke(IPC_CHANNELS.pickVideoFile),
    uploadToYoutube: (params: {
      accountId: string;
      filePath: string;
      title: string;
      description?: string;
    }) => ipcRenderer.invoke(IPC_CHANNELS.uploadToYoutube, params),
  },
});
