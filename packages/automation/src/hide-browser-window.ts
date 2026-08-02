import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveHideScriptPath(): string {
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/hide-camoufox-window.ps1"),
    path.resolve(process.cwd(), "../../packages/automation/scripts/hide-camoufox-window.ps1"),
    path.resolve(process.cwd(), "../packages/automation/scripts/hide-camoufox-window.ps1"),
    path.resolve(process.cwd(), "packages/automation/scripts/hide-camoufox-window.ps1"),
    path.resolve(process.cwd(), "build/instagram-worker/hide-camoufox-window.ps1"),
    path.resolve(process.cwd(), "../../apps/client/build/instagram-worker/hide-camoufox-window.ps1"),
    typeof process.resourcesPath === "string"
      ? path.join(process.resourcesPath, "instagram-worker", "hide-camoufox-window.ps1")
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? path.resolve(process.cwd(), "hide-camoufox-window.ps1");
}

let hideRefCount = 0;
let hideWatcher: ChildProcess | undefined;
let resolvedHideScript: string | undefined;

function hideScriptPath(): string {
  resolvedHideScript ??= resolveHideScriptPath();
  return resolvedHideScript;
}

/** Synchronous hide — catches windows as soon as they appear. */
export function hideCamoufoxWindowsSync(): void {
  if (process.platform !== "win32") {
    return;
  }

  const script = hideScriptPath();
  if (!existsSync(script)) {
    return;
  }

  try {
    execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { windowsHide: true, stdio: "ignore", timeout: 2000 },
    );
  } catch {
    // Best-effort.
  }
}

function startHideWatcher(): void {
  if (process.platform !== "win32" || hideWatcher) {
    return;
  }

  const script = hideScriptPath();
  if (!existsSync(script)) {
    return;
  }

  hideCamoufoxWindowsSync();
  const child = spawn(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Loop"],
    { windowsHide: true, stdio: "ignore" },
  );
  hideWatcher = child;
  child.on("exit", () => {
    if (hideWatcher === child) {
      hideWatcher = undefined;
    }
  });
}

function stopHideWatcher(): void {
  if (!hideWatcher) return;
  try {
    if (process.platform === "win32" && hideWatcher.pid) {
      spawn("taskkill", ["/PID", String(hideWatcher.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      }).unref();
    } else {
      hideWatcher.kill();
    }
  } catch {
    // ignore
  }
  hideWatcher = undefined;
}

/**
 * Keep Camoufox hidden while uploads run. Reference-counted — safe for
 * parallel Instagram jobs and multi-platform batches.
 */
export function acquireCamoufoxHide(): () => void {
  if (process.platform !== "win32") {
    return () => undefined;
  }

  hideRefCount += 1;
  if (hideRefCount === 1) {
    startHideWatcher();
  } else {
    hideCamoufoxWindowsSync();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    hideRefCount = Math.max(0, hideRefCount - 1);
    if (hideRefCount === 0) {
      stopHideWatcher();
    }
  };
}

/** @deprecated Use acquireCamoufoxHide for uploads. */
export async function hideCamoufoxWindows(): Promise<void> {
  hideCamoufoxWindowsSync();
}

/** @deprecated Use acquireCamoufoxHide for uploads. */
export function startCamoufoxHideLoop(): () => void {
  return acquireCamoufoxHide();
}
