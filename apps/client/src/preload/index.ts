import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateUploadBatch,
  UploadJobSummary,
  UploadTransferProgress,
  LicenseClientState,
} from "@autouploader/shared";
import { IPC_CHANNELS } from "../main/ipc/channels.js";

contextBridge.exposeInMainWorld("api", {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),
  accounts: {
    connectYoutube: (label: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.connectYoutubeAccount, label),
    connectTiktok: (label: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.connectTiktokAccount, label),
    connectInstagram: (label: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.connectInstagramAccount, label),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.listAccounts),
    delete: (accountId: string) => ipcRenderer.invoke(IPC_CHANNELS.deleteAccount, accountId),
    updateProxy: (
      accountId: string,
      proxy: { server: string; username?: string; password?: string } | null,
    ) => ipcRenderer.invoke(IPC_CHANNELS.updateAccountProxy, accountId, proxy),
    updateLabel: (accountId: string, label: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.updateAccountLabel, accountId, label),
  },
  video: {
    pickFile: () => ipcRenderer.invoke(IPC_CHANNELS.pickVideoFile),
    pickFiles: () => ipcRenderer.invoke(IPC_CHANNELS.pickVideoFiles),
    uploadToYoutube: (params: {
      accountId: string;
      filePath: string;
      title: string;
      description?: string;
      privacyStatus?: "private" | "unlisted" | "public";
    }) => ipcRenderer.invoke(IPC_CHANNELS.uploadToYoutube, params),
    uploadToTiktok: (params: { accountId: string; filePath: string; caption?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.uploadToTiktok, params),
    uploadToInstagram: (params: { accountId: string; filePath: string; caption?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.uploadToInstagram, params),
  },
  jobs: {
    createBatch: (request: CreateUploadBatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.createUploadBatch, request),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.listUploadJobs),
    retry: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.retryUploadJob, jobId),
    cancel: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.cancelUploadJob, jobId),
    onProgress: (callback: (job: UploadJobSummary) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, job: UploadJobSummary) => callback(job);
      ipcRenderer.on(IPC_CHANNELS.uploadJobProgress, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.uploadJobProgress, listener);
    },
    onUploadProgress: (callback: (progress: UploadTransferProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: UploadTransferProgress) =>
        callback(progress);
      ipcRenderer.on(IPC_CHANNELS.uploadTransferProgress, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.uploadTransferProgress, listener);
    },
  },
  license: {
    status: (): Promise<LicenseClientState> => ipcRenderer.invoke(IPC_CHANNELS.licenseStatus),
    activate: (key: string): Promise<LicenseClientState> =>
      ipcRenderer.invoke(IPC_CHANNELS.licenseActivate, key),
    refresh: (): Promise<LicenseClientState> => ipcRenderer.invoke(IPC_CHANNELS.licenseRefresh),
    deactivate: (): Promise<LicenseClientState> =>
      ipcRenderer.invoke(IPC_CHANNELS.licenseDeactivate),
  },
  youtube: {
    getOAuthClient: () => ipcRenderer.invoke(IPC_CHANNELS.youtubeGetOAuthClient),
    setOAuthClient: (input: { clientId: string; clientSecret: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.youtubeSetOAuthClient, input),
    clearOAuthClient: () => ipcRenderer.invoke(IPC_CHANNELS.youtubeClearOAuthClient),
  },
  updater: {
    version: () => ipcRenderer.invoke(IPC_CHANNELS.updaterVersion) as Promise<string>,
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updaterCheck) as Promise<void>,
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updaterInstall) as Promise<void>,
    onStatus: (callback: (status: import("../main/ipc/channels.js").UpdateStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        status: import("../main/ipc/channels.js").UpdateStatus,
      ) => callback(status);
      ipcRenderer.on(IPC_CHANNELS.updaterStatus, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.updaterStatus, listener);
    },
  },
});
