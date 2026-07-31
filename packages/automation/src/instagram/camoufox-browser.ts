import type { Browser, BrowserContext } from "playwright-core";
import type { ProxyConfig } from "@autouploader/shared";
import { resolveCamoufoxOs } from "../platform.js";

export interface CamoufoxSessionOptions {
  headless?: boolean;
  storageState?: object;
  proxy?: ProxyConfig;
}

const lockedAccounts = new Set<string>();

type CamoufoxFactory = (options?: Record<string, unknown>) => Promise<Browser>;

/**
 * camoufox-js is ESM-only. Electron main is bundled as CJS, so a static
 * `import`/`require` crashes with ERR_REQUIRE_ESM. Load via native dynamic
 * import that Vite/Rollup cannot rewrite to require().
 */
async function loadCamoufox(): Promise<CamoufoxFactory> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{ Camoufox: CamoufoxFactory }>;
  const mod = await dynamicImport("camoufox-js");
  return mod.Camoufox;
}

/**
 * Launch Camoufox (open-source anti-detect Firefox). Used for Instagram
 * because stock Chromium/Patchright is often blocked as automation.
 */
export async function launchCamoufoxBrowser(options: {
  headless?: boolean;
  proxy?: ProxyConfig;
}): Promise<Browser> {
  const Camoufox = await loadCamoufox();

  const launch: Record<string, unknown> = {
    headless: options.headless ?? false,
    os: resolveCamoufoxOs(),
    locale: "ru-RU",
    humanize: true,
    // Default uBlock addon may be missing if fetch failed mid-way on GeoIP.
    exclude_addons: ["UBO"],
    firefox_user_prefs: {
      "media.volume_scale": "0.0",
      "media.default_volume": 0.0,
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

export async function withInstagramCamoufoxContext<T>(
  accountId: string,
  options: CamoufoxSessionOptions,
  fn: (context: BrowserContext, browser: Browser) => Promise<T>,
): Promise<T> {
  if (lockedAccounts.has(accountId)) {
    throw new Error(`Аккаунт ${accountId} уже используется другой сессией автоматизации`);
  }
  lockedAccounts.add(accountId);

  let browser: Browser | undefined;
  try {
    browser = await launchCamoufoxBrowser({
      headless: options.headless,
      proxy: options.proxy,
    });

    const context = await browser.newContext({
      storageState: options.storageState as never,
      viewport: { width: 1920, height: 1080 },
      locale: "ru-RU",
    });

    try {
      return await fn(context, browser);
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser?.close().catch(() => {});
    lockedAccounts.delete(accountId);
  }
}
