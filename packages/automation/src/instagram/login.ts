import { INSTAGRAM_SELECTORS } from "./selectors.js";
import { launchCamoufoxBrowser } from "./camoufox-browser.js";
import {
  runInstagramLoginViaSubprocess,
  shouldUseInstagramSubprocess,
} from "./subprocess.js";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

/**
 * Opens Instagram in Camoufox (anti-detect Firefox) and waits for manual login.
 * Detects success via the `sessionid` cookie, then returns storageState.
 */
export async function runInstagramLoginFlow(proxy?: {
  server: string;
  username?: string;
  password?: string;
}): Promise<{ storageState: object }> {
  if (shouldUseInstagramSubprocess()) {
    return runInstagramLoginViaSubprocess(proxy);
  }

  const browser = await launchCamoufoxBrowser({ headless: false, proxy });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: "ru-RU",
    });
    const page = await context.newPage();

    await page.goto(INSTAGRAM_SELECTORS.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });

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
      if (hasSession) {
        loggedIn = true;
        break;
      }
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    if (!loggedIn) {
      throw new Error(
        "Не удалось определить успешный вход в Instagram за 5 минут — войди в окне Camoufox (instagram.com) и попробуй ещё раз",
      );
    }

    await page.goto(INSTAGRAM_SELECTORS.homeUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);

    const storageState = await context.storageState();
    await context.close().catch(() => {});
    return { storageState };
  } finally {
    await browser.close().catch(() => {});
  }
}
