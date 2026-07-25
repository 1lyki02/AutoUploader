import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../channels.js";

export function registerPingHandler(): void {
  ipcMain.handle(IPC_CHANNELS.ping, async () => {
    return `pong ${new Date().toISOString()}`;
  });
}
