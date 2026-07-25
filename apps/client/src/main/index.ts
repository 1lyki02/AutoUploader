import { app } from "electron";
import { createMainWindow } from "./window.js";
import { registerPingHandler } from "./ipc/handlers/ping.js";

app.whenReady().then(() => {
  registerPingHandler();
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
