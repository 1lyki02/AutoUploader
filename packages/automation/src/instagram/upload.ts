import type { Page } from "playwright-core";
import type { ProxyConfig } from "@autouploader/shared";
import { withInstagramCamoufoxContext } from "./camoufox-browser.js";
import { mutePageMedia } from "../mute-media.js";
import { INSTAGRAM_SELECTORS } from "./selectors.js";
import {
  runInstagramUploadViaSubprocess,
  shouldUseInstagramSubprocess,
} from "./subprocess.js";

export interface UploadInstagramParams {
  accountId: string;
  storageState: object;
  proxy?: ProxyConfig;
  filePath: string;
  caption?: string;
  /** Defaults to visible — Instagram UI automation is more reliable headed. */
  headless?: boolean;
}

async function dismissCookieBanner(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: INSTAGRAM_SELECTORS.cookieConsentButtonText })
    .click({ timeout: 3000 })
    .catch(() => {});
}

async function clickCreate(page: Page): Promise<void> {
  const candidates = [
    page.getByRole("link", { name: INSTAGRAM_SELECTORS.createButtonText }).first(),
    page.getByRole("button", { name: INSTAGRAM_SELECTORS.createButtonText }).first(),
    page.locator('svg[aria-label="Создать"], svg[aria-label="New post"], svg[aria-label="Create"]').first(),
    page.getByLabel(INSTAGRAM_SELECTORS.createReelsAria).first(),
    page.locator('span:text-is("Создать"), span:text-is("Create")').first(),
  ];

  for (const locator of candidates) {
    if ((await locator.count()) === 0) continue;
    try {
      await locator.click({ timeout: 4000 });
      return;
    } catch {
      // try next
    }
  }

  await page.goto(INSTAGRAM_SELECTORS.reelsCreateUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
}

async function clickReelsOption(page: Page): Promise<void> {
  const option = page
    .locator('[role="menuitem"], [role="button"], span, a, div')
    .filter({ hasText: INSTAGRAM_SELECTORS.reelsOptionText })
    .first();

  if ((await option.count()) > 0) {
    await option.click({ timeout: 5000 }).catch(() => {});
  }
}

async function dismissSampleModal(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: INSTAGRAM_SELECTORS.gotItButtonText })
    .click({ timeout: 4000 })
    .catch(() => {});

  await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return;
    const buttons = Array.from(dialog.querySelectorAll("button"));
    for (const button of buttons) {
      const text = (button.textContent || "").trim();
      if (text === "OK" || text === "Понятно" || text === "Got it") {
        button.click();
        return;
      }
    }
  });
}

async function clickNext(page: Page): Promise<void> {
  const next = page
    .locator('div[role="button"], button, a, span')
    .filter({ hasText: INSTAGRAM_SELECTORS.nextButtonText })
    .first();

  if ((await next.count()) === 0) {
    throw new Error("Не найдена кнопка «Далее» на шаге создания Reels.");
  }
  await next.click({ timeout: 8000 });
}

async function fillCaption(page: Page, caption: string): Promise<void> {
  const editor = page.locator(INSTAGRAM_SELECTORS.captionEditor).first();
  if ((await editor.count()) === 0) {
    return;
  }

  await editor.click({ timeout: 5000 });
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type(caption, { delay: 20 });
}

async function clickShare(page: Page): Promise<void> {
  const shareCandidates = [
    page.getByRole("button", { name: INSTAGRAM_SELECTORS.shareButtonText }).first(),
    page.locator('div[role="button"]').filter({ hasText: INSTAGRAM_SELECTORS.shareButtonText }).first(),
    page.locator('[aria-label="Поделиться"], [aria-label="Share"]').first(),
  ];

  for (const locator of shareCandidates) {
    if ((await locator.count()) === 0) continue;
    try {
      await locator.scrollIntoViewIfNeeded();
      await locator.click({ timeout: 5000 });
      return;
    } catch {
      // try next
    }
  }

  throw new Error("Не найдена кнопка «Поделиться» для публикации Reels.");
}

/**
 * Uploads and publishes an Instagram Reel via Camoufox (anti-detect) UI automation.
 */
export async function uploadToInstagram(params: UploadInstagramParams): Promise<void> {
  if (shouldUseInstagramSubprocess()) {
    await runInstagramUploadViaSubprocess({
      storageState: params.storageState,
      filePath: params.filePath,
      caption: params.caption,
      proxy: params.proxy,
      headless: params.headless ?? true,
    });
    return;
  }

  await withInstagramCamoufoxContext(
    params.accountId,
    {
      headless: params.headless ?? true,
      storageState: params.storageState,
      proxy: params.proxy,
    },
    async (context) => {
      const page = await context.newPage();
      await mutePageMedia(page);

      await page.goto(INSTAGRAM_SELECTORS.reelsUrl, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.waitForTimeout(3000);

      if (page.url().includes("/accounts/login") || page.url().includes("/challenge")) {
        throw new Error(
          "Instagram session недействительна. Переподключите Instagram-аккаунт и попробуйте снова.",
        );
      }

      await dismissCookieBanner(page);
      await clickCreate(page);
      await page.waitForTimeout(2500);
      await clickReelsOption(page);
      await page.waitForTimeout(2500);

      const fileInput = page.locator(INSTAGRAM_SELECTORS.fileInput).first();
      await page.waitForSelector(INSTAGRAM_SELECTORS.fileInput, {
        timeout: 60_000,
        state: "attached",
      });
      if ((await fileInput.count()) === 0) {
        throw new Error("Не удалось найти поле загрузки файла на Instagram.");
      }
      await fileInput.setInputFiles(params.filePath);

      await page.waitForTimeout(15_000);
      await dismissSampleModal(page);
      await page.waitForTimeout(2000);

      await clickNext(page);
      await page.waitForTimeout(3000);
      await clickNext(page);
      await page.waitForTimeout(3000);

      if (params.caption) {
        await fillCaption(page, params.caption);
        await page.waitForTimeout(1500);
      }

      await clickShare(page);
      await page.waitForTimeout(30_000);
    },
  );
}
