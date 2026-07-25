import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import dotenv from "dotenv";
import { registerPingHandler } from "./ipc/handlers/ping.js";
import { registerAccountsHandlers } from "./ipc/handlers/accounts.js";
import { registerVideoHandlers } from "./ipc/handlers/video.js";
import { createMainWindow } from "./window.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

app.whenReady().then(() => {
  registerPingHandler();
  registerAccountsHandlers();
  registerVideoHandlers();
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
