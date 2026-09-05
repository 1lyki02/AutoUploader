/**
 * Push ci-build and trigger GitHub Actions macOS release upload.
 * Run after `pnpm publish:github` (Windows) so both platforms share the same version tag.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(clientDir, "../..");
const version = JSON.parse(readFileSync(path.join(clientDir, "package.json"), "utf8")).version;

if (!version) {
  throw new Error("apps/client/package.json version is empty");
}

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit", cwd: repoRoot });
}

console.log(`[trigger-macos-release] version v${version}`);

run("git push origin HEAD:ci-build");

run(
  `gh workflow run "Build macOS client" --ref ci-build -f publish=true`,
);

console.log("");
console.log(`macOS CI started for v${version}.`);
console.log("Track: https://github.com/1lyki02/AutoUploader/actions");
console.log(`When done, check: https://github.com/1lyki02/AutoUploader/releases/tag/v${version}`);
