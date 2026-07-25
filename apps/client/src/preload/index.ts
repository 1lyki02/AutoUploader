import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../main/ipc/channels.js";

contextBridge.exposeInMainWorld("api", {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),
});
