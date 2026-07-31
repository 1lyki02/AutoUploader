import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(root, "../vendor");
const target = path.join(vendorDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

if (existsSync(target)) {
  process.exit(0);
}

let source = "";
try {
  source = require("ffmpeg-static");
} catch {
  console.warn("[ensure-ffmpeg] ffmpeg-static is not installed");
  process.exit(0);
}

if (!source || !existsSync(source)) {
  console.warn("[ensure-ffmpeg] ffmpeg binary missing — run install scripts for ffmpeg-static");
  process.exit(0);
}

mkdirSync(vendorDir, { recursive: true });
copyFileSync(source, target);
console.log(`[ensure-ffmpeg] copied to ${target}`);
