import { randomUUID } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProxyConfig } from "@autouploader/shared";

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
  const candidates = [
    packagedWorkerScript(),
    path.resolve(process.cwd(), "../../packages/automation/scripts/instagram-browser-worker.mjs"),
    path.resolve(process.cwd(), "packages/automation/scripts/instagram-browser-worker.mjs"),
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

function resolveWorkerRuntime(workerScript: string): {
  command: string;
  shell: boolean;
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const workerDir = path.dirname(workerScript);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CAMOUFOX_INSTALL_DIR: path.join(workerDir, "camoufox"),
  };

  if (packagedWorkerScript() === workerScript) {
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

function spawnWorker(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const workerScript = findWorkerScript();
  const { command, shell, cwd, env } = resolveWorkerRuntime(workerScript);

  return new Promise((resolve, reject) => {
    const child = spawn(command, [workerScript, ...args], {
      env,
      cwd,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const crashpadOnly =
        stderr.includes("crashpad_client_win.cc") && stdout.trim().length === 0;
      if (crashpadOnly) {
        reject(
          new Error(
            "Camoufox завершился с ошибкой при запуске из Electron. Перезапустите приложение и попробуйте снова; если повторится — проверьте, что `node` доступен в PATH.",
          ),
        );
        return;
      }

      reject(
        new Error(
          stderr.trim() || stdout.trim() || `Instagram worker exited with code ${code}`,
        ),
      );
    });
  });
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
    const { stdout } = await spawnWorker(args);
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
}): Promise<void> {
  const paramsFile = await writeTempJson(params);
  try {
    await spawnWorker(["upload", "--params-file", paramsFile]);
  } finally {
    await removeTempFile(paramsFile);
  }
}
