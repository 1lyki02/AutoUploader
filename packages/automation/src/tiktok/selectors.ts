/**
 * TikTok changes its web upload DOM without notice and without a public API to
 * depend on instead — this file is the single place to patch when uploads start
 * failing. These selectors have NOT been verified against the live site by an
 * automated test in this repo (no way to browse TikTok from the environment that
 * wrote this file) — verify/patch them against the real page before relying on
 * automatic posting.
 */
export const TIKTOK_SELECTORS = {
  loginUrl: "https://www.tiktok.com/login",
  uploadPageUrl: "https://www.tiktok.com/upload?lang=en",
  /** Cookie TikTok sets once login completes — used to detect a finished manual login. */
  sessionCookieName: "sessionid",
  fileInput: 'input[type="file"]',
  captionEditor: '[data-e2e="video-caption"] [contenteditable="true"]',
  postButton: '[data-e2e="post-button"]',
} as const;
