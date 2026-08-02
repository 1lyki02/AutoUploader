import { existsSync } from "node:fs";
import path from "node:path";

function isCamoufoxInstall(dir: string): boolean {
  return existsSync(path.join(dir, "version.json"));
}

/**
 * Finds an existing Camoufox browser install. Dev often has it under
 * apps/client/build/instagram-worker/camoufox, while the worker script
 * lives in packages/automation/scripts/.
 */
export function resolveCamoufoxInstallDir(workerDir?: string): string {
  if (process.env.CAMOUFOX_INSTALL_DIR && isCamoufoxInstall(process.env.CAMOUFOX_INSTALL_DIR)) {
    return process.env.CAMOUFOX_INSTALL_DIR;
  }

  const candidates = [
    workerDir ? path.join(workerDir, "camoufox") : null,
    typeof process.resourcesPath === "string"
      ? path.join(process.resourcesPath, "instagram-worker", "camoufox")
      : null,
    path.resolve(process.cwd(), "build/instagram-worker/camoufox"),
    path.resolve(process.cwd(), "release/win-unpacked/resources/instagram-worker/camoufox"),
    path.resolve(process.cwd(), "../../apps/client/build/instagram-worker/camoufox"),
    path.resolve(process.cwd(), "apps/client/build/instagram-worker/camoufox"),
    workerDir
      ? path.resolve(workerDir, "../../../apps/client/build/instagram-worker/camoufox")
      : null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (isCamoufoxInstall(candidate)) {
      return candidate;
    }
  }

  return workerDir ? path.join(workerDir, "camoufox") : path.join(process.cwd(), "camoufox");
}

export function applyCamoufoxInstallDir(workerDir?: string): string {
  const installDir = resolveCamoufoxInstallDir(workerDir);
  process.env.CAMOUFOX_INSTALL_DIR = installDir;
  return installDir;
}
