import { chromium } from "patchright";
import { TIKTOK_SELECTORS } from "./selectors.js";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

/**
 * Opens a visible browser at TikTok's login page and waits for the user to complete
 * login manually (any method — email, phone, QR, third-party) by polling for the
 * session cookie TikTok sets once login succeeds. Captures and returns the resulting
 * storageState (cookies + localStorage) for headless reuse afterward.
 */
export async function runTikTokLoginFlow(): Promise<{ storageState: object }> {
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(TIKTOK_SELECTORS.loginUrl);

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let loggedIn = false;
    while (Date.now() < deadline) {
      const cookies = await context.cookies();
      if (cookies.some((c) => c.name === TIKTOK_SELECTORS.sessionCookieName)) {
        loggedIn = true;
        break;
      }
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    if (!loggedIn) {
      throw new Error(
        "Не удалось определить успешный вход в TikTok за 5 минут — попробуй ещё раз",
      );
    }

    const storageState = await context.storageState();
    return { storageState };
  } finally {
    await browser.close();
  }
}
