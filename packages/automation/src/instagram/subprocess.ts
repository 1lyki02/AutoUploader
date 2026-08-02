import { randomUUID } from "node:crypto";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProxyConfig } from "@autouploader/shared";
import { resolveCamoufoxInstallDir } from "../camoufox-path.js";
import { acquireCamoufoxHide } from "../hide-browser-window.js";

function isElectronMainProcess(): boolean {
  return Boolean(process.versions.electron);
}

function packagedWorkerScript(): string | undefined {
  if (typeof process.resourcesPath !== "string" || process.resourcesPath.length === 0) {
    return undefined;
  }

  const candidate = path.join(
    process.resourcesPath,
    "instagram-worker",
    "instagram-browser-worker.mjs",
  );
  return existsSync(candidate) ? candidate : undefined;
}

function findWorkerScript(): string {
  // Prefer live monorepo source over packaged/build copies (those go stale in dev).
  const candidates = [
    path.resolve(process.cwd(), "../../packages/automation/scripts/instagram-browser-worker.mjs"),
    path.resolve(process.cwd(), "../packages/automation/scripts/instagram-browser-worker.mjs"),
    path.resolve(process.cwd(), "packages/automation/scripts/instagram-browser-worker.mjs"),
    path.resolve(
      process.cwd(),
      "../../apps/client/build/instagram-worker/instagram-browser-worker.mjs",
    ),
    path.resolve(process.cwd(), "build/instagram-worker/instagram-browser-worker.mjs"),
    packagedWorkerScript(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Не найден instagram-browser-worker.mjs. Пересоберите клиент (`pnpm --filter @autouploader/client package`) или запустите dev из корня monorepo (`pnpm dev:client`).",
  );
}

function packagedNodeBinary(workerDir: string): string | undefined {
  const candidates =
    process.platform === "win32"
      ? [path.join(workerDir, "node", "node.exe")]
      : [path.join(workerDir, "node", "node")];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function resolveWorkerRuntime(workerScript: string): {
  command: string;
  shell: boolean;
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const workerDir = path.dirname(workerScript);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CAMOUFOX_INSTALL_DIR: resolveCamoufoxInstallDir(workerDir),
  };

  if (packagedWorkerScript() === workerScript) {
    const bundledNode = packagedNodeBinary(workerDir);
    if (bundledNode) {
      return { command: bundledNode, shell: false, cwd: workerDir, env };
    }

    return {
      command: process.execPath,
      shell: false,
      cwd: workerDir,
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    };
  }

  const candidates = [process.env.npm_node_execpath, process.env.NODE].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { command: candidate, shell: false, cwd: workerDir, env };
    }
  }

  if (process.platform === "win32") {
    try {
      const resolved = execSync("where.exe node", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && existsSync(line));

      if (resolved) {
        return { command: resolved, shell: false, cwd: workerDir, env };
      }
    } catch {
      // fall through to `node` on PATH
    }
  }

  return { command: "node", shell: process.platform === "win32", cwd: workerDir, env };
}

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) {
    child.kill("SIGKILL");
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 3000).unref();
}

function spawnWorkerKillable(
  args: string[],
  options?: { hideBrowser?: boolean },
): {
  promise: Promise<{ stdout: string; stderr: string }>;
  kill: () => void;
} {
  const releaseHide = options?.hideBrowser ? acquireCamoufoxHide() : () => undefined;
  const workerScript = findWorkerScript();
  const { command, shell, cwd, env } = resolveWorkerRuntime(workerScript);

  const child = spawn(command, [workerScript, ...args], {
    env,
    cwd,
    shell,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: args[0] !== "login",
  });

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const promise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", (error) => {
      releaseHide();
      reject(error);
    });
    child.on("close", (code) => {
      releaseHide();
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const detail = stderr.trim() || stdout.trim();
      reject(
        new Error(
          detail
            ? detail.split("\n").slice(-6).join("\n")
            : `Instagram worker exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });

  return {
    promise,
    kill: () => killProcessTree(child),
  };
}

async function writeTempJson(data: unknown): Promise<string> {
  const dir = path.join(os.tmpdir(), "autouploader");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `ig-${randomUUID()}.json`);
  await writeFile(filePath, JSON.stringify(data), "utf8");
  return filePath;
}

async function removeTempFile(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => {});
}

export function shouldUseInstagramSubprocess(): boolean {
  return isElectronMainProcess();
}

export async function runInstagramLoginViaSubprocess(
  proxy?: ProxyConfig,
): Promise<{ storageState: object }> {
  const args = ["login"];
  let proxyFile: string | undefined;

  if (proxy) {
    proxyFile = await writeTempJson(proxy);
    args.push("--proxy-file", proxyFile);
  }

  try {
    const { stdout } = await spawnWorkerKillable(args).promise;
    const parsed = JSON.parse(stdout.trim()) as { storageState: object };
    if (!parsed.storageState) {
      throw new Error("Instagram worker returned invalid login payload");
    }
    return { storageState: parsed.storageState };
  } finally {
    if (proxyFile) {
      await removeTempFile(proxyFile);
    }
  }
}

export async function runInstagramUploadViaSubprocess(params: {
  storageState: object;
  filePath: string;
  caption?: string;
  proxy?: ProxyConfig;
  headless?: boolean;
  signal?: AbortSignal;
}): Promise<void> {
  const { signal, ...workerParams } = params;
  const paramsFile = await writeTempJson(workerParams);
  const hideBrowser = workerParams.headless !== false;
  const { promise, kill } = spawnWorkerKillable(["upload", "--params-file", paramsFile], {
    hideBrowser,
  });
  const onAbort = () => kill();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await promise;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await removeTempFile(paramsFile);
  }
}
