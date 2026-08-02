import { chromium } from "patchright";
import { INSTAGRAM_SELECTORS } from "./selectors.js";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

/**
 * Opens a visible browser at Instagram login and waits for the user to finish
 * login manually (password / 2FA / checkpoint in the browser). Detects success
 * via the `sessionid` cookie, then returns storageState for later uploads.
 *
 * Ported from the working Selenium InstagramManual.login flow.
 */
export async function runInstagramLoginFlow(): Promise<{ storageState: object }> {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

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
      const cookies = await context.cookies();
      const hasSession = cookies.some((c) => c.name === INSTAGRAM_SELECTORS.sessionCookieName);
      const url = page.url();
      if (hasSession && !url.includes("/accounts/login") && !url.includes("/challenge")) {
        loggedIn = true;
        break;
      }
      if (hasSession && !url.includes("/accounts/login")) {
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

    const storageState = await context.storageState();
    return { storageState };
  } finally {
    await browser.close();
  }
}
