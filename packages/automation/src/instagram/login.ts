import type { ProxyConfig } from "@autouploader/shared";
import { launchAutomationBrowser } from "../browser-pool.js";
import { INSTAGRAM_SELECTORS } from "./selectors.js";
import {
  runInstagramLoginViaSubprocess,
  shouldUseInstagramSubprocess,
} from "./subprocess.js";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

/**
 * Opens a visible browser at Instagram and waits for manual login.
 * In the packaged Electron app uses bundled Camoufox worker (no Patchright install).
 */
export async function runInstagramLoginFlow(
  proxy?: ProxyConfig,
): Promise<{ storageState: object }> {
  if (shouldUseInstagramSubprocess()) {
    return runInstagramLoginViaSubprocess(proxy);
  }

  const browser = await launchAutomationBrowser(false);

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    await page.goto(INSTAGRAM_SELECTORS.loginUrl, { waitUntil: "domcontentloaded" });

    await page
      .getByRole("button", { name: INSTAGRAM_SELECTORS.cookieConsentButtonText })
      .click({ timeout: 4000 })
      .catch(() => {});

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let loggedIn = false;
    while (Date.now() < deadline) {
      const cookies = await context.cookies("https://www.instagram.com");
      const hasSession = cookies.some(
        (c) => c.name === INSTAGRAM_SELECTORS.sessionCookieName && Boolean(c.value),
      );
      const url = page.url();
      if (hasSession && !url.includes("/accounts/login") && !url.includes("/challenge")) {
        loggedIn = true;
        break;
      }
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    if (!loggedIn) {
      throw new Error(
        "Не удалось определить успешный вход в Instagram за 5 минут — войди в открывшемся окне и попробуй ещё раз",
      );
    }

    await page.goto(INSTAGRAM_SELECTORS.homeUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(1500);

    return { storageState: await context.storageState() };
  } finally {
    await browser.close();
  }
}
