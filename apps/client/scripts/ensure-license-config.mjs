import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(scriptDir, "..");
const target = path.join(clientDir, "license.config.json");
const example = path.join(clientDir, "license.config.example.json");

if (existsSync(target)) {
  process.exit(0);
}

if (!existsSync(example)) {
  console.error("[ensure-license-config] license.config.example.json not found");
  process.exit(1);
}

copyFileSync(example, target);
console.log(`[ensure-license-config] copied ${example} -> ${target}`);
