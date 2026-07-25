import type { ProxyConfig } from "@autouploader/shared";
import { withAccountContext } from "../browser-pool.js";
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
 * not guessed.
 */
export async function uploadToTikTok(params: UploadTikTokParams): Promise<void> {
  await withAccountContext(
    params.accountId,
    {
      headless: params.headless ?? false,
      storageState: params.storageState,
      proxy: params.proxy,
    },
    async (context) => {
      const page = await context.newPage();
      await page.goto(TIKTOK_SELECTORS.uploadPageUrl, { waitUntil: "networkidle" });

      await page
        .getByRole("button", { name: TIKTOK_SELECTORS.cookieConsentButtonText })
        .click({ timeout: 3000 })
        .catch(() => {});

      const fileInput = page.locator(TIKTOK_SELECTORS.fileInput).first();
      await fileInput.setInputFiles(params.filePath);

      // TikTok needs real time to process the upload before the rest of the form works.
      await page.waitForTimeout(35_000);

      await page
        .getByRole("button", { name: TIKTOK_SELECTORS.gotItButtonText })
        .click({ timeout: 3000 })
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
        await caption.click();
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
        await page.keyboard.type(params.caption, { delay: 20 });
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      let postButton = page.locator(TIKTOK_SELECTORS.postButton).first();
      if ((await postButton.count()) === 0) {
        postButton = page
          .getByRole("button", { name: TIKTOK_SELECTORS.postButtonFallbackText })
          .first();
      }
      await postButton.scrollIntoViewIfNeeded();
      await postButton.click();

      // Second confirmation click if TikTok shows a modal (e.g. copyright notice).
      await page
        .locator(TIKTOK_SELECTORS.modalContainer)
        .getByRole("button", { name: TIKTOK_SELECTORS.modalPostButtonText })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});

      await page.waitForTimeout(5000);
    },
  );
}
