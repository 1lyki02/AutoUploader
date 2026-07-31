import type { ProxyConfig } from "@autouploader/shared";
import { withAccountContext } from "../browser-pool.js";
import { measureNetworkTiming } from "../network-timing.js";
import { mutePageMedia } from "../mute-media.js";
import { TIKTOK_SELECTORS } from "./selectors.js";

export interface UploadTikTokParams {
  accountId: string;
  storageState: object;
  proxy?: ProxyConfig;
  filePath: string;
  caption?: string;
  /** Defaults to visible — flip to true once selectors are confirmed reliable for background/scheduled runs. */
  headless?: boolean;
}

/**
 * Uploads and publishes a video to TikTok end-to-end, including clicking Post.
 * Flow ported from a working Python/Selenium prototype (see PrepareTikTokUploadParams
 * history) — timings and fallback selectors below are copied from that proven flow,
 * not guessed. Timeouts scale with measured network latency before the run starts.
 */
export async function uploadToTikTok(params: UploadTikTokParams): Promise<void> {
  const timing = await measureNetworkTiming();

  await withAccountContext(
    params.accountId,
    {
      headless: params.headless ?? true,
      storageState: params.storageState,
      proxy: params.proxy,
    },
    async (context) => {
      const navTimeout = timing.scaledMs(120_000);
      const settleMs = timing.scaledMs(2500);
      const uploadProcessingTimeout = timing.scaledMs(120_000);
      const postClickTimeout = timing.scaledMs(60_000);

      const page = await context.newPage();
      await mutePageMedia(page);
      await page.goto(TIKTOK_SELECTORS.uploadPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: navTimeout,
      });

      await page.waitForTimeout(settleMs);
      if (page.url().includes("/login") || page.url().includes("/challenge")) {
        throw new Error(
          "TikTok session недействительна. Переподключите TikTok-аккаунт и попробуйте снова.",
        );
      }

      await page
        .getByRole("button", { name: TIKTOK_SELECTORS.cookieConsentButtonText })
        .click({ timeout: timing.scaledMs(3000) })
        .catch(() => {});

      let fileInput = page.locator(TIKTOK_SELECTORS.fileInput).first();
      if ((await fileInput.count()) === 0) {
        await page.goto(TIKTOK_SELECTORS.altUploadPageUrl, {
          waitUntil: "domcontentloaded",
          timeout: navTimeout,
        });
        await page.waitForTimeout(settleMs);
        fileInput = page.locator(TIKTOK_SELECTORS.fileInput).first();
      }

      await page.waitForSelector(TIKTOK_SELECTORS.fileInput, {
        timeout: navTimeout,
        state: "attached",
      });
      if ((await fileInput.count()) === 0) {
        throw new Error(
          "Не удалось найти поле загрузки файла на TikTok. Возможно, структура страницы изменилась или аккаунт не вошёл в систему.",
        );
      }
      await fileInput.setInputFiles(params.filePath);

      // Give TikTok time to start processing the upload before interacting with the form.
      await page.waitForTimeout(timing.scaledMs(5000));

      await page
        .getByRole("button", { name: TIKTOK_SELECTORS.gotItButtonText })
        .click({ timeout: timing.scaledMs(3000) })
        .catch(() => {});

      // Onboarding tooltips (react-joyride) can visually block clicks — strip them.
      await page.evaluate(() => {
        document
          .querySelectorAll(
            '.react-joyride__overlay, .react-joyride__tooltip, [class*="overlay"], [class*="tooltip"]',
          )
          .forEach((el) => el.remove());
      });

      if (params.caption) {
        const caption = page.locator(TIKTOK_SELECTORS.captionEditor).first();
        if ((await caption.count()) > 0) {
          await caption.click();
          await page.keyboard.press("Control+A");
          await page.keyboard.press("Delete");
          await page.keyboard.type(params.caption, { delay: 20 });
        }
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      let postButton = page.locator(TIKTOK_SELECTORS.postButton).first();
      if ((await postButton.count()) === 0) {
        postButton = page
          .getByRole("button", { name: TIKTOK_SELECTORS.postButtonFallbackText })
          .first();
      }

      if ((await postButton.count()) === 0) {
        throw new Error(
          "Не удалось найти кнопку публикации на TikTok. Возможно, страница изменилась или необходима ручная проверка.",
        );
      }

      await postButton.scrollIntoViewIfNeeded();
      try {
        await page.waitForFunction(
          () => {
            const button = document.querySelector('[data-e2e="post_video_button"]');
            if (!button) {
              return false;
            }
            return (
              button.getAttribute("aria-disabled") !== "true" &&
              button.getAttribute("data-disabled") !== "true"
            );
          },
          undefined,
          { timeout: uploadProcessingTimeout },
        );
      } catch {
        throw new Error(
          `TikTok не завершил обработку видео за ${Math.round(uploadProcessingTimeout / 1000)} с ` +
            `(задержка сети ~${Math.round(timing.latencyMs)} мс). Проверьте интернет и попробуйте снова.`,
        );
      }
      await postButton.click({ timeout: postClickTimeout });

      // Second confirmation click if TikTok shows a modal (e.g. copyright notice).
      await page
        .locator(TIKTOK_SELECTORS.modalContainer)
        .getByRole("button", { name: TIKTOK_SELECTORS.modalPostButtonText })
        .first()
        .click({ timeout: timing.scaledMs(5000) })
        .catch(() => {});

      await page.waitForTimeout(timing.scaledMs(5000));
    },
  );
}
