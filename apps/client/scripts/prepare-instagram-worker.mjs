import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(scriptDir, "..");
const outDir = path.join(clientDir, "build", "instagram-worker");
const camoufoxDir = path.join(outDir, "camoufox");
const workerSrc = path.resolve(
  clientDir,
  "../../packages/automation/scripts/instagram-browser-worker.mjs",
);

function log(message) {
  console.log(`[prepare-instagram-worker] ${message}`);
}

function resolveNodeBinary() {
  const fromEnv = process.env.npm_node_execpath ?? process.env.NODE;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  if (process.platform === "win32") {
    try {
      const resolved = execSync("where.exe node", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && existsSync(line));
      if (resolved) return resolved;
    } catch {
      // fall through
    }
  }

  throw new Error(
    "Node.js not found. Install Node 22+ and ensure `node` is on PATH before packaging the client.",
  );
}

if (!existsSync(workerSrc)) {
  throw new Error(`Worker script not found: ${workerSrc}`);
}

function camoufoxLooksInstalled(dir) {
  const binary = process.platform === "win32" ? "camoufox.exe" : "camoufox";
  return (
    existsSync(path.join(dir, "version.json")) && existsSync(path.join(dir, binary))
  );
}

function resolveCamoufoxCacheSource() {
  const candidates = [
    camoufoxDir,
    path.join(clientDir, "release/win-unpacked/resources/instagram-worker/camoufox"),
    path.join(os.tmpdir(), "autouploader-camoufox-backup"),
  ];
  return candidates.find((candidate) => camoufoxLooksInstalled(candidate));
}

const cachedCamoufox = resolveCamoufoxCacheSource();
const tempCamoufoxBackup = path.join(os.tmpdir(), "autouploader-camoufox-backup");
if (cachedCamoufox) {
  rmSync(tempCamoufoxBackup, { recursive: true, force: true });
  cpSync(cachedCamoufox, tempCamoufoxBackup, { recursive: true });
  log(`Cached Camoufox browser from ${cachedCamoufox}`);
}

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

cpSync(workerSrc, path.join(outDir, "instagram-browser-worker.mjs"));

const hideScriptSrc = path.resolve(
  clientDir,
  "../../packages/automation/scripts/hide-camoufox-window.ps1",
);
if (existsSync(hideScriptSrc)) {
  cpSync(hideScriptSrc, path.join(outDir, "hide-camoufox-window.ps1"));
}

const restoreScriptSrc = path.resolve(
  clientDir,
  "../../packages/automation/scripts/restore-camoufox-window.ps1",
);
if (existsSync(restoreScriptSrc)) {
  cpSync(restoreScriptSrc, path.join(outDir, "restore-camoufox-window.ps1"));
}

const clientPkg = JSON.parse(readFileSync(path.join(clientDir, "package.json"), "utf8"));
writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(
    {
      name: "instagram-worker-runtime",
      private: true,
      type: "module",
      dependencies: {
        "camoufox-js": clientPkg.dependencies["camoufox-js"],
      },
    },
    null,
    2,
  ),
);

log("Installing camoufox-js runtime...");
execSync("npm install --omit=dev --no-package-lock", {
  cwd: outDir,
  stdio: "inherit",
});

log(`Fetching Camoufox browser to ${camoufoxDir}...`);
mkdirSync(camoufoxDir, { recursive: true });
const fetchEnv = { ...process.env };
delete fetchEnv.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
try {
  execSync("npx camoufox-js fetch", {
    cwd: outDir,
    env: {
      ...fetchEnv,
      CAMOUFOX_INSTALL_DIR: camoufoxDir,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
    },
    stdio: "inherit",
  });
} catch (error) {
  if (!camoufoxLooksInstalled(tempCamoufoxBackup)) {
    throw error;
  }
  log(`Camoufox fetch failed, reusing cached browser from ${tempCamoufoxBackup}`);
  cpSync(tempCamoufoxBackup, camoufoxDir, { recursive: true });
}

if (!camoufoxLooksInstalled(camoufoxDir)) {
  throw new Error(
    `Camoufox browser was not installed in ${camoufoxDir}. ` +
      "Ensure camoufox-js fetch can download the browser (do not set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD during fetch).",
  );
}

const nodeRuntimeDir = path.join(outDir, "node");
mkdirSync(nodeRuntimeDir, { recursive: true });
const nodeBinaryName = process.platform === "win32" ? "node.exe" : "node";
cpSync(resolveNodeBinary(), path.join(nodeRuntimeDir, nodeBinaryName));
log(`Bundled Node runtime: ${path.join(nodeRuntimeDir, nodeBinaryName)}`);

log(`Ready: ${outDir}`);
