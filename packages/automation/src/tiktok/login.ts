import type { BrowserContext, Page } from "patchright";
import { launchAutomationBrowser } from "../browser-pool.js";
import { TIKTOK_SELECTORS } from "./selectors.js";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const MIN_SESSION_ID_LENGTH = 32;
const SESSION_STABLE_CHECKS = 3;

function readSessionId(cookies: Awaited<ReturnType<BrowserContext["cookies"]>>): string | undefined {
  const session = cookies.find(
    (cookie) => cookie.name === TIKTOK_SELECTORS.sessionCookieName && cookie.value.length >= MIN_SESSION_ID_LENGTH,
  );
  return session?.value;
}

async function getSessionId(context: BrowserContext): Promise<string | undefined> {
  for (const domain of ["https://www.tiktok.com", "https://tiktok.com"]) {
    const sessionId = readSessionId(await context.cookies(domain));
    if (sessionId) {
      return sessionId;
    }
  }
  return readSessionId(await context.cookies());
}

async function canAccessUploadPage(page: Page): Promise<boolean> {
  await page.goto(TIKTOK_SELECTORS.uploadPageUrl, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes("/login") || url.includes("/signup") || url.includes("/challenge")) {
    return false;
  }

  const fileInput = page.locator(TIKTOK_SELECTORS.fileInput).first();
  if ((await fileInput.count()) === 0) {
    await page.goto(TIKTOK_SELECTORS.altUploadPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  if (page.url().includes("/login") || page.url().includes("/signup")) {
    return false;
  }

  return (await page.locator(TIKTOK_SELECTORS.fileInput).count()) > 0;
}

/**
 * Opens visible Chrome at TikTok login. Saves storageState only after
 * a real session cookie and TikTok Studio upload access are confirmed.
 */
export async function runTikTokLoginFlow(): Promise<{ storageState: object }> {
  const browser = await launchAutomationBrowser(false);
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "ru-RU",
    });
    const page = await context.newPage();
    await page.goto(TIKTOK_SELECTORS.loginUrl, { waitUntil: "domcontentloaded" });

    await page
      .getByRole("button", { name: TIKTOK_SELECTORS.cookieConsentButtonText })
      .click({ timeout: 4000 })
      .catch(() => {});

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let stableChecks = 0;
    let lastSessionId: string | undefined;

    while (Date.now() < deadline) {
      const sessionId = await getSessionId(context);
      if (sessionId && sessionId === lastSessionId) {
        stableChecks += 1;
      } else {
        stableChecks = sessionId ? 1 : 0;
        lastSessionId = sessionId;
      }

      if (stableChecks >= SESSION_STABLE_CHECKS) {
        if (await canAccessUploadPage(page)) {
          return { storageState: await context.storageState() };
        }
        stableChecks = 0;
        lastSessionId = undefined;
      }

      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    throw new Error(
      "Не удалось сохранить вход в TikTok — дождитесь, пока откроется ваша лента с профилем, " +
        "затем попробуйте подключить аккаунт снова",
    );
  } finally {
    await browser.close();
  }
}
