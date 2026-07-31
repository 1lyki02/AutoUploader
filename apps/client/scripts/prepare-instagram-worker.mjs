import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
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

if (!existsSync(workerSrc)) {
  throw new Error(`Worker script not found: ${workerSrc}`);
}

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

cpSync(workerSrc, path.join(outDir, "instagram-browser-worker.mjs"));

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
execSync("npx camoufox-js fetch", {
  cwd: outDir,
  env: { ...process.env, CAMOUFOX_INSTALL_DIR: camoufoxDir },
  stdio: "inherit",
});

log(`Ready: ${outDir}`);
