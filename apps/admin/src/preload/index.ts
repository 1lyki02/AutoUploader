import { contextBridge, ipcRenderer } from "electron";
import type {
  GenerateLicenseRequest,
  GenerateLicenseResponse,
  LicenseAdminAction,
  LicenseAdminSummary,
} from "@autouploader/shared";

contextBridge.exposeInMainWorld("adminApi", {
  list: (): Promise<LicenseAdminSummary[]> => ipcRenderer.invoke("licenses:list"),
  generate: (input: GenerateLicenseRequest): Promise<GenerateLicenseResponse> =>
    ipcRenderer.invoke("licenses:generate", input),
  action: (input: LicenseAdminAction): Promise<LicenseAdminSummary> =>
    ipcRenderer.invoke("licenses:action", input),
  events: (licenseId: string): Promise<unknown[]> =>
    ipcRenderer.invoke("licenses:events", licenseId),
});
