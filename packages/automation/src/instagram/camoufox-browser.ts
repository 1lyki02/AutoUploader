import type { Browser, BrowserContext } from "playwright-core";
import type { ProxyConfig } from "@autouploader/shared";
import { resolveCamoufoxOs } from "../platform.js";
import { applyCamoufoxInstallDir } from "../camoufox-path.js";
import { acquireCamoufoxHide } from "../hide-browser-window.js";

export interface CamoufoxSessionOptions {
  headless?: boolean;
  storageState?: object;
  proxy?: ProxyConfig;
}

const lockedAccounts = new Set<string>();

type CamoufoxFactory = (options?: Record<string, unknown>) => Promise<Browser>;

async function loadCamoufox(): Promise<CamoufoxFactory> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{ Camoufox: CamoufoxFactory }>;
  const mod = await dynamicImport("camoufox-js");
  return mod.Camoufox;
}

/**
 * Launch Camoufox (open-source anti-detect Firefox). Used for Instagram and TikTok
 * because stock Chromium/Patchright is often blocked or requires a separate install.
 *
 * `headless: true` means background mode (headed + transparent window) — Instagram
 * upload does not complete in Firefox true-headless on Windows.
 */
export async function launchCamoufoxBrowser(options: {
  headless?: boolean;
  proxy?: ProxyConfig;
}): Promise<Browser> {
  applyCamoufoxInstallDir();
  const Camoufox = await loadCamoufox();

  const launch: Record<string, unknown> = {
    headless: false,
    os: resolveCamoufoxOs(),
    locale: "ru-RU",
    humanize: true,
    window: [1920, 1080],
    exclude_addons: ["UBO"],
    firefox_user_prefs: {
      "media.volume_scale": "0.0",
    },
  };

  if (options.proxy?.server) {
    launch.proxy = {
      server: options.proxy.server.startsWith("http")
        ? options.proxy.server
        : `http://${options.proxy.server}`,
      username: options.proxy.username,
      password: options.proxy.password,
    };
  }

  return await Camoufox(launch);
}


export async function withCamoufoxContext<T>(
  accountId: string,
  options: CamoufoxSessionOptions,
  fn: (context: BrowserContext, browser: Browser) => Promise<T>,
): Promise<T> {
  if (lockedAccounts.has(accountId)) {
    throw new Error(`Аккаунт ${accountId} уже используется другой сессией автоматизации`);
  }
  lockedAccounts.add(accountId);

  let browser: Browser | undefined;
  const stopHide = options.headless === true ? acquireCamoufoxHide() : () => undefined;
  try {
    browser = await launchCamoufoxBrowser({
      headless: options.headless,
      proxy: options.proxy,
    });

    const context = await browser.newContext({
      storageState: options.storageState as never,
      locale: "ru-RU",
    });

    try {
      return await fn(context, browser);
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    stopHide();
    await browser?.close().catch(() => {});
    lockedAccounts.delete(accountId);
  }
}
