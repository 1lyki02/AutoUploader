import { ipcMain } from "electron";
import { getLicenseService } from "../../license/service.js";
import { IPC_CHANNELS } from "../channels.js";

export function registerLicenseHandlers(): void {
  const service = getLicenseService();
  ipcMain.handle(IPC_CHANNELS.licenseStatus, async () => service.getState());
  ipcMain.handle(IPC_CHANNELS.licenseActivate, async (_event, key: string) =>
    service.activate(key));
  ipcMain.handle(IPC_CHANNELS.licenseRefresh, async () => service.refresh());
  ipcMain.handle(IPC_CHANNELS.licenseDeactivate, async () => service.deactivate());
}
