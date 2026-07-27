export const INSTAGRAM_SELECTORS = {
  loginUrl: "https://www.instagram.com/accounts/login/",
  homeUrl: "https://www.instagram.com/",
  reelsUrl: "https://www.instagram.com/reels/",
  reelsCreateUrl: "https://www.instagram.com/reels/create/",
  /** Cookie Instagram sets once login completes — used to detect a finished manual login. */
  sessionCookieName: "sessionid",
  fileInput:
    'input[type="file"], input[accept*="video"], input[data-testid="media-attachment-input"]',
  cookieConsentButtonText: /Разрешить все|Accept All|Allow all|Accept/,
  createButtonText: /Создать|Create/,
  createReelsAria: /Создать Reels|Create Reel|New reel|Новая публикация/,
  reelsOptionText: /^Reels$|^Рилс$|^Reel$/,
  gotItButtonText: /^OK$|Понятно|Got it/,
  nextButtonText: /Далее|Next|Продолжить/,
  shareButtonText: /Поделиться|Share/,
  captionEditor:
    'div[contenteditable="true"], textarea[aria-label*="caption"], textarea[placeholder*="caption"], textarea[placeholder*="Напишите подпись"], textarea[aria-label*="Write a caption"]',
} as const;
