/**
 * Verified against a working Python/Selenium prototype (undetected_chromedriver)
 * the user had already built and tested against the live site — these are real,
 * exercised selectors, not guesses. TikTok's upload flow now lives under
 * "TikTok Studio", not the old plain /upload path. Still the single place to
 * patch if TikTok changes its DOM again.
 */
export const TIKTOK_SELECTORS = {
  loginUrl: "https://www.tiktok.com/login",
  uploadPageUrl: "https://www.tiktok.com/tiktokstudio/upload",
  altUploadPageUrl: "https://www.tiktok.com/upload",
  /** Cookie TikTok sets once login completes — used to detect a finished manual login. */
  sessionCookieName: "sessionid",
  fileInput: 'input[type="file"], input[accept*="video"]',
  cookieConsentButtonText: /Разрешить все|Accept all|Accept/,
  /** Dismisses the post-upload "sample"/onboarding tooltip. */
  gotItButtonText: /Понятно|Got it|OK/,
  captionEditor: 'div[contenteditable="true"], textarea[aria-label*="caption"], textarea[placeholder*="caption"]',
  postButton: '[data-e2e="post_video_button"], button:has-text("Опубликовать"), button:has-text("Post")',
  postButtonFallbackText: /Опубликовать|Post/,
  /** TikTok sometimes shows a confirmation modal (e.g. copyright notice) after the first Post click. */
  modalContainer: '[class*="modal"], [class*="dialog"]',
  modalPostButtonText: /Опубликовать|Post|Share/,
} as const;
