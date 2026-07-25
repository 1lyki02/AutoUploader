import { chromium, type Browser, type BrowserContext } from "patchright";
import type { ProxyConfig } from "@autouploader/shared";

export interface AccountContextOptions {
  headless: boolean;
  storageState?: object;
  proxy?: ProxyConfig;
}

const lockedAccounts = new Set<string>();

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
    browser = await chromium.launch({ headless: options.headless });
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
