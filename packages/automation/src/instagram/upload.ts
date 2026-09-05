import type { Page } from "patchright";
import type { ProxyConfig } from "@autouploader/shared";
import { withAccountContext } from "../browser-pool.js";
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
  /** `true` = background (headed transparent). `false` = visible window. */
  headless?: boolean;
  signal?: AbortSignal;
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

async function clickReelsOption(page: Page): Promise<boolean> {
  const candidates = [
    page.getByRole("menuitem", { name: INSTAGRAM_SELECTORS.reelsOptionText }).first(),
    page.getByRole("button", { name: INSTAGRAM_SELECTORS.reelsOptionText }).first(),
    page.getByText(INSTAGRAM_SELECTORS.reelsOptionText, { exact: true }).first(),
  ];

  for (const option of candidates) {
    if ((await option.count()) === 0) continue;
    try {
      await option.click({ timeout: 5000 });
      return true;
    } catch {
      // try next
    }
  }

  return false;
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

async function clickNext(page: Page): Promise<void> {
  const candidates = [
    page.getByRole("button", { name: INSTAGRAM_SELECTORS.nextButtonText }).first(),
    page.getByRole("link", { name: INSTAGRAM_SELECTORS.nextButtonText }).first(),
    page.locator('div[role="button"]').filter({ hasText: INSTAGRAM_SELECTORS.nextButtonText }).first(),
    page.getByText(INSTAGRAM_SELECTORS.nextButtonText, { exact: true }).first(),
  ];

  for (const next of candidates) {
    try {
      await next.waitFor({ state: "visible", timeout: 20_000 });
      await next.click({ timeout: 20_000 });
      return;
    } catch {
      // try next
    }
  }

  throw new Error("Не найдена активная кнопка «Далее» после обработки видео.");
}

async function dismissPromoDialogs(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Не сейчас|Not now|Maybe later|Позже/i })
    .click({ timeout: 3000 })
    .catch(() => {});
}

async function getPublishState(page: Page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").slice(0, 12000);
    const onComposeScreen = /Новое видео Reels|New reel|Create new reel/i.test(text);
    let headerPublishVisible = false;

    for (const el of document.querySelectorAll("a, button, div, span, [role='button']")) {
      if (el.closest('[role="dialog"]')) continue;
      const label = (el.textContent || "").trim();
      if (label !== "Поделиться" && label !== "Share") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.top <= 200 && rect.right >= window.innerWidth * 0.45) {
        headerPublishVisible = true;
        break;
      }
    }

    const shareSheetOpen =
      /Поиск|Search|Копировать ссылку|Copy link/i.test(text)
      && /Поделиться|Share/i.test(text);
    const sharing = /sharing|публику|загрузк|uploading|processing|отправк/i.test(text);
    const success =
      /reel.*(shared|опублик)|your reel has been shared|reels.*опублик|shared successfully|опубликовано/i.test(
        text,
      );
    const error = /something went wrong|что-то пошло не так|try again|повторите попытку|не удалось/i.test(
      text,
    );

    return { onComposeScreen, headerPublishVisible, shareSheetOpen, sharing, success, error };
  });
}

async function waitForPublishComplete(page: Page): Promise<void> {
  const startedAt = Date.now();
  const deadline = startedAt + 10 * 60 * 1000;
  const publishMinWaitMs = 60_000;
  let leftComposeStreak = 0;

  while (Date.now() < deadline) {
    const state = await getPublishState(page);
    const minWaitDone = Date.now() - startedAt >= publishMinWaitMs;

    if (state.error) {
      throw new Error("Instagram сообщил об ошибке при публикации Reels.");
    }
    if (state.shareSheetOpen) {
      throw new Error(
        "Открылось окно «Поделиться с друзьями» вместо публикации Reels.",
      );
    }
    if (state.success && minWaitDone) {
      return;
    }
    if (!state.onComposeScreen && !state.headerPublishVisible && minWaitDone) {
      leftComposeStreak += 1;
      if (leftComposeStreak >= 2) {
        return;
      }
    } else if (state.onComposeScreen || state.headerPublishVisible) {
      leftComposeStreak = 0;
    }

    await page.waitForTimeout(2000);
  }

  const finalState = await getPublishState(page);
  if (finalState.onComposeScreen || finalState.headerPublishVisible) {
    throw new Error(
      "Instagram не подтвердил публикацию Reels — экран «Новое видео Reels» всё ещё открыт.",
    );
  }

  const remaining = publishMinWaitMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await page.waitForTimeout(remaining);
  }
}

async function clickShare(page: Page): Promise<void> {
  await dismissPromoDialogs(page);

  const headerShare = page.locator("a, button, div, span, [role='button']").filter({
    hasText: /^Поделиться$|^Share$/,
  });
  const headerCount = await headerShare.count();
  for (let i = 0; i < headerCount; i++) {
    const item = headerShare.nth(i);
    const inDialog = await item.evaluate((el) => Boolean(el.closest('[role="dialog"]')));
    if (inDialog) continue;

    const box = await item.boundingBox();
    if (!box || box.y > 200) continue;

    const pageWidth = await page.evaluate(() => window.innerWidth);
    if (box.x + box.width < pageWidth * 0.45) continue;

    try {
      await item.click({ timeout: 8000 });
      return;
    } catch {
      // try next header match
    }
  }

  const shareCandidates = [
    page.getByRole("button", { name: INSTAGRAM_SELECTORS.shareButtonText }).first(),
    page.locator('div[role="button"]').filter({ hasText: INSTAGRAM_SELECTORS.shareButtonText }).first(),
    page.locator('[aria-label="Поделиться"], [aria-label="Share"]').first(),
    page.getByText(/^Поделиться$|^Share$/).first(),
  ];

  for (const locator of shareCandidates) {
    if ((await locator.count()) === 0) continue;
    try {
      await locator.scrollIntoViewIfNeeded();
      await locator.click({ timeout: 8000 });
      return;
    } catch {
      // try next
    }
  }

  throw new Error("Не найдена кнопка «Поделиться» для публикации Reels.");
}

async function runUploadFlow(
  page: Page,
  filePath: string,
  caption?: string,
): Promise<void> {
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
  await dismissPromoDialogs(page);
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
  await fileInput.setInputFiles(filePath);

  await page.waitForTimeout(15_000);
  await dismissSampleModal(page);
  await dismissPromoDialogs(page);
  await page.waitForTimeout(2000);

  await clickNext(page);
  await page.waitForTimeout(3000);
  await clickNext(page);
  await page.waitForTimeout(3000);

  if (caption) {
    await fillCaption(page, caption);
    await page.waitForTimeout(1500);
  }

  await clickShare(page);
  await waitForPublishComplete(page);
}

/**
 * Uploads and publishes an Instagram Reel via browser UI.
 * Flow ported from the working Selenium InstagramManual.upload_reels prototype (v0.1.0).
 */
export async function uploadToInstagram(params: UploadInstagramParams): Promise<void> {
  if (params.signal?.aborted) {
    throw new DOMException("Upload cancelled", "AbortError");
  }

  if (shouldUseInstagramSubprocess()) {
    await runInstagramUploadViaSubprocess({
      storageState: params.storageState,
      filePath: params.filePath,
      caption: params.caption,
      proxy: params.proxy,
      headless: params.headless ?? true,
      signal: params.signal,
    });
    return;
  }

  await withAccountContext(
    params.accountId,
    {
      headless: params.headless ?? true,
      storageState: params.storageState,
      proxy: params.proxy,
    },
    async (context) => {
      const page = await context.newPage();
      await runUploadFlow(page, params.filePath, params.caption);
    },
  );
}
