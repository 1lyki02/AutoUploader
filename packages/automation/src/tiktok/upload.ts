import { chromium } from "patchright";
import type { ProxyConfig } from "@autouploader/shared";
import { TIKTOK_SELECTORS } from "./selectors.js";

export interface PrepareTikTokUploadParams {
  storageState: object;
  proxy?: ProxyConfig;
  filePath: string;
  caption?: string;
}

/**
 * Fills in the video + caption on TikTok's upload page in a VISIBLE browser window
 * and deliberately stops short of clicking "Post". TikTok's upload DOM changes often
 * enough that blind auto-posting on unverified selectors risks publishing something
 * broken (or clicking the wrong control entirely) — the human confirms and clicks
 * Post themselves in the window this opens. Once `TIKTOK_SELECTORS.postButton` is
 * confirmed reliable against the live site, this is the one place to wire up an
 * automatic click and switch to headless.
 *
 * Does not use browser-pool's account lock/auto-close — this is an inherently
 * supervised, one-at-a-time action while a human is watching the window.
 */
export async function prepareTikTokUpload(params: PrepareTikTokUploadParams): Promise<void> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: params.storageState as never,
    proxy: params.proxy,
  });
  const page = await context.newPage();

  await page.goto(TIKTOK_SELECTORS.uploadPageUrl, { waitUntil: "networkidle" });

  const fileInput = page.locator(TIKTOK_SELECTORS.fileInput).first();
  await fileInput.setInputFiles(params.filePath);

  // TikTok takes a while to process the video before the caption editor appears.
  await page.waitForSelector(TIKTOK_SELECTORS.captionEditor, { timeout: 120_000 });

  if (params.caption) {
    const caption = page.locator(TIKTOK_SELECTORS.captionEditor).first();
    await caption.click();
    await caption.fill(params.caption);
  }

  // Browser stays open — see doc comment above.
}
