import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PAUSE_CAMOUFOX_HIDE_FLAG = path.join(
  os.tmpdir(),
  "autouploader-pause-camoufox-hide",
);

function resolveAutomationScript(name: string): string {
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts", name),
    path.resolve(process.cwd(), "../../packages/automation/scripts", name),
    path.resolve(process.cwd(), "../packages/automation/scripts", name),
    path.resolve(process.cwd(), "packages/automation/scripts", name),
    path.resolve(process.cwd(), "build/instagram-worker", name),
    path.resolve(process.cwd(), "../../apps/client/build/instagram-worker", name),
    typeof process.resourcesPath === "string"
      ? path.join(process.resourcesPath, "instagram-worker", name)
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? path.resolve(process.cwd(), name);
}

function resolveHideScriptPath(): string {
  return resolveAutomationScript("hide-camoufox-window.ps1");
}

function resolveRestoreScriptPath(): string {
  return resolveAutomationScript("restore-camoufox-window.ps1");
}

let hideRefCount = 0;
let hideWatcher: ChildProcess | undefined;
let hideInterval: NodeJS.Timeout | undefined;
let resolvedHideScript: string | undefined;

function hideScriptPath(): string {
  resolvedHideScript ??= resolveHideScriptPath();
  return resolvedHideScript;
}

/** Pause the hide loop (optional — e.g. debugging with a visible window). */
export function pauseCamoufoxHide(): void {
  try {
    writeFileSync(PAUSE_CAMOUFOX_HIDE_FLAG, "");
  } catch {
    // Best-effort.
  }
}

export function resumeCamoufoxHide(): void {
  try {
    unlinkSync(PAUSE_CAMOUFOX_HIDE_FLAG);
  } catch {
    // Best-effort.
  }
  hideCamoufoxWindowsSync();
}

function runOsascript(script: string): void {
  try {
    execFileSync("osascript", ["-e", script], { stdio: "ignore", timeout: 2000 });
  } catch {
    // Best-effort — macOS may require Accessibility permission for System Events.
  }
}

/** Move Camoufox windows off-screen without minimizing (Firefox stops rendering when minimized). */
function hideCamoufoxWindowsDarwin(): void {
  if (process.platform !== "darwin" || existsSync(PAUSE_CAMOUFOX_HIDE_FLAG)) {
    return;
  }

  runOsascript(`
    tell application "System Events"
      repeat with proc in (every process whose name contains "camoufox" or name contains "Camoufox")
        try
          repeat with w in (every window of proc)
            try
              set position of w to {-4000, -4000}
            end try
          end repeat
        end try
      end repeat
    end tell
  `);
}

function restoreCamoufoxWindowsDarwin(): void {
  if (process.platform !== "darwin") {
    return;
  }

  runOsascript(`
    tell application "System Events"
      repeat with proc in (every process whose name contains "camoufox" or name contains "Camoufox")
        try
          repeat with w in (every window of proc)
            try
              set position of w to {120, 80}
            end try
          end repeat
        end try
      end repeat
    end tell
  `);
}

/** Restore minimized Camoufox windows before the final publish click. */
export function restoreCamoufoxWindowsSync(): void {
  if (process.platform === "darwin") {
    restoreCamoufoxWindowsDarwin();
    return;
  }

  if (process.platform !== "win32") {
    return;
  }

  const script = resolveRestoreScriptPath();
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

/** Synchronous hide — catches windows as soon as they appear. */
export function hideCamoufoxWindowsSync(): void {
  if (process.platform === "darwin") {
    hideCamoufoxWindowsDarwin();
    return;
  }

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
  if (process.platform === "win32") {
    if (hideWatcher) {
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
    return;
  }

  if (process.platform === "darwin") {
    if (hideInterval) {
      return;
    }

    hideCamoufoxWindowsDarwin();
    hideInterval = setInterval(hideCamoufoxWindowsDarwin, 100);
  }
}

function stopHideWatcher(): void {
  if (hideWatcher) {
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

  if (hideInterval) {
    clearInterval(hideInterval);
    hideInterval = undefined;
  }
}

/**
 * Keep Camoufox hidden while uploads run. Reference-counted — safe for
 * parallel Instagram jobs and multi-platform batches.
 */
export function acquireCamoufoxHide(): () => void {
  if (process.platform !== "win32" && process.platform !== "darwin") {
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
