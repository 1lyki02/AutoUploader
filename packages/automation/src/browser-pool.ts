import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "patchright";
import type { ProxyConfig } from "@autouploader/shared";

export interface AccountContextOptions {
  headless: boolean;
  storageState?: object;
  proxy?: ProxyConfig;
}

const lockedAccounts = new Set<string>();

function chromiumCandidates(): string[] {
  const fromEnv = process.env.TIKTOK_BROWSER_EXECUTABLE;
  const base = [fromEnv, chromium.executablePath()].filter(
    (value): value is string => Boolean(value),
  );

  if (process.platform === "darwin") {
    return [
      ...base,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    ];
  }

  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const localAppData = process.env.LOCALAPPDATA;

    return [
      ...base,
      programFiles && `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      programFilesX86 && `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      localAppData && `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
      programFiles && `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      programFilesX86 && `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ].filter((value): value is string => Boolean(value));
  }

  return [
    ...base,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

export function resolveChromiumExecutable(): string | undefined {
  return chromiumCandidates().find((candidate) => existsSync(candidate));
}

export async function launchAutomationBrowser(headless: boolean): Promise<Browser> {
  const executablePath = resolveChromiumExecutable();
  if (!executablePath && process.platform !== "linux") {
    throw new Error(
      "Не найден браузер для TikTok. Установите Google Chrome/Microsoft Edge или задайте TIKTOK_BROWSER_EXECUTABLE.",
    );
  }

  return chromium.launch({
    headless,
    executablePath,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--mute-audio",
    ],
  });
}

/**
 * Runs `fn` with a fresh, isolated browser context for `accountId`, refusing to
 * start a second concurrent session for the same account — running two automation
 * sessions on one account at once is a behavioral red flag platforms watch for.
 * The browser is always launched fresh and torn down after `fn` resolves or throws.
 */
export async function withAccountContext<T>(
  accountId: string,
  options: AccountContextOptions,
  fn: (context: BrowserContext) => Promise<T>,
): Promise<T> {
  if (lockedAccounts.has(accountId)) {
    throw new Error(`Аккаунт ${accountId} уже используется другой сессией автоматизации`);
  }
  lockedAccounts.add(accountId);

  let browser: Browser | undefined;
  try {
    browser = await launchAutomationBrowser(options.headless);
    const context = await browser.newContext({
      storageState: options.storageState as never,
      proxy: options.proxy,
    });
    return await fn(context);
  } finally {
    await browser?.close();
    lockedAccounts.delete(accountId);
  }
}
