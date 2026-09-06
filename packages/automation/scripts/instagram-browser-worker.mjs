/**
 * Standalone Instagram browser worker (Camoufox).
 * Upload flow: Reels feed + DOM clicks (Camoufox). Share button via Playwright locators.
 */
import { readFile } from "node:fs/promises";
import { Camoufox } from "camoufox-js";

const SELECTORS = {
  homeUrl: "https://www.instagram.com/",
  reelsUrl: "https://www.instagram.com/reels/",
  reelsCreateUrl: "https://www.instagram.com/reels/create/",
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
};

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const PUBLISH_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const PUBLISH_POLL_MS = 2000;
const PUBLISH_MIN_WAIT_MS = 60_000;

function resolveCamoufoxOs() {
  const env = process.env.CAMOUFOX_OS;
  if (env === "linux" || env === "macos" || env === "windows") return env;
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "macos";
  return "windows";
}

function parseArgs(argv) {
  const args = { command: argv[0], proxyFile: null, paramsFile: null };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--proxy-file" && argv[i + 1]) {
      args.proxyFile = argv[++i];
    } else if (argv[i] === "--params-file" && argv[i + 1]) {
      args.paramsFile = argv[++i];
    }
  }
  return args;
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

/**
 * Instagram upload fails in Firefox true-headless on Windows.
 * Background mode runs headed; on Windows the window is hidden via transparency,
 * on macOS it is moved off-screen (minimize breaks rendering).
 */
async function launchBrowser(proxy, background = false) {
  const launch = {
    // Never true-headless — Instagram upload breaks on Windows.
    headless: false,
    os: resolveCamoufoxOs(),
    locale: "ru-RU",
    humanize: true,
    // Camoufox controls window size itself — do not call page.setViewportSize().
    window: [1920, 1080],
    exclude_addons: ["UBO"],
    firefox_user_prefs: {
      "media.volume_scale": "0.0",
    },
  };

  if (proxy?.server) {
    launch.proxy = {
      server: proxy.server.startsWith("http") ? proxy.server : `http://${proxy.server}`,
      username: proxy.username,
      password: proxy.password,
    };
  }

  return Camoufox(launch);
}

async function runLogin(proxyFile) {
  const proxy = proxyFile ? await readJsonFile(proxyFile) : undefined;
  const browser = await launchBrowser(proxy, false);

  try {
    const context = await browser.newContext({
      locale: "ru-RU",
    });
    const page = await context.newPage();

    await page.goto(SELECTORS.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });

    await page
      .getByRole("button", { name: SELECTORS.cookieConsentButtonText })
      .click({ timeout: 4000 })
      .catch(() => {});

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let loggedIn = false;
    while (Date.now() < deadline) {
      const cookies = await context.cookies("https://www.instagram.com");
      const hasSession = cookies.some(
        (c) => c.name === SELECTORS.sessionCookieName && Boolean(c.value),
      );
      if (hasSession) {
        loggedIn = true;
        break;
      }
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    if (!loggedIn) {
      throw new Error(
        "Не удалось определить успешный вход в Instagram за 5 минут — войди в окне Camoufox (instagram.com) и попробуй ещё раз",
      );
    }

    await page.goto(SELECTORS.homeUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);

    const storageState = await context.storageState();
    await context.close().catch(() => {});
    process.stdout.write(JSON.stringify({ storageState }));
  } finally {
    await browser.close().catch(() => {});
  }
}

async function dismissCookieBanner(page) {
  await domClickButton(page, SELECTORS.cookieConsentButtonText);
}

async function dismissPromoDialogs(page) {
  await domClickButton(page, /Не сейчас|Not now|Maybe later|Позже/i);

  await page.evaluate(() => {
    for (const button of document.querySelectorAll("button, [role='button']")) {
      const text = (button.textContent || "").trim();
      if (text === "OK" || text === "Понятно" || text === "Got it" || text === "Хорошо") {
        button.click();
        return;
      }
    }
  });
}

/** Playwright click hangs on Camoufox when overlays intercept — use DOM click. */
async function domClickButton(page, labelPattern) {
  return page.evaluate(({ source, flags }) => {
    const re = new RegExp(source, flags);
    const nodes = document.querySelectorAll(
      'button, [role="button"], a, span, div[role="menuitem"], [role="link"]',
    );
    for (const el of nodes) {
      const text = (el.textContent || "").trim();
      const aria = el.getAttribute("aria-label") || "";
      if (!re.test(text) && !re.test(aria)) continue;
      const clickable =
        el.closest('button, [role="button"], a, [role="menuitem"], [role="link"]') || el;
      const rect = clickable.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      clickable.click();
      return true;
    }
    return false;
  }, { source: labelPattern.source, flags: labelPattern.flags });
}

async function clickSidebarCreate(page) {
  return page.evaluate(() => {
    const labelPattern = /создать|create|new post|новая публикация/i;
    const tryClick = (el) => {
      if (!el) return false;
      const clickable =
        el.closest('a, button, [role="button"], [role="link"], div[tabindex]') || el;
      const rect = clickable.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      clickable.click();
      return true;
    };

    for (const svg of document.querySelectorAll("svg[aria-label]")) {
      const label = svg.getAttribute("aria-label") || "";
      if (!labelPattern.test(label)) continue;
      if (tryClick(svg)) return true;
    }

    for (const el of document.querySelectorAll(
      'a[href*="/create"], [aria-label*="Create"], [aria-label*="Создать"], [aria-label*="New post"]',
    )) {
      const href = el.getAttribute("href") || "";
      if (href.includes("/reels/create")) continue;
      if (tryClick(el)) return true;
    }

    for (const el of document.querySelectorAll(
      'nav a, nav span, [role="navigation"] a, [role="navigation"] span, [role="button"], button',
    )) {
      const text = (el.textContent || "").trim();
      if (!/^(Создать|Create|New post)$/i.test(text)) continue;
      if (tryClick(el)) return true;
    }

    return false;
  });
}

async function clickCreate(page) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await dismissCookieBanner(page);
    await dismissPromoDialogs(page);

    if (await clickSidebarCreate(page)) {
      return;
    }

    if (await domClickButton(page, SELECTORS.createButtonText)) {
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    "Не найдена кнопка «Создать» в Instagram. Дождитесь загрузки ленты или переподключите аккаунт.",
  );
}

async function clickReelsOption(page) {
  if (await domClickButton(page, SELECTORS.reelsOptionText)) {
    return true;
  }
  return false;
}

async function clickSelectFromComputer(page) {
  return domClickButton(
    page,
    /^(Выбрать на компьютере|Выбрать с компьютера|Select from computer|Select files)$/i,
  );
}

async function attachVideo(page, filePath) {
  const fileInput = page.locator(SELECTORS.fileInput).first();
  let reelsOptionClicked = false;
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    await dismissPromoDialogs(page);

    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles(filePath);
      return;
    }

    if (!reelsOptionClicked) {
      reelsOptionClicked = await clickReelsOption(page);
      if (reelsOptionClicked) {
        await page.waitForTimeout(1000);
        continue;
      }
    }

    if (await clickSelectFromComputer(page)) {
      await page.waitForTimeout(750);
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles(filePath);
        return;
      }
      try {
        const chooser = await page.waitForEvent("filechooser", { timeout: 5000 });
        await chooser.setFiles(filePath);
        return;
      } catch {
        // fall through
      }
    }

    await page.waitForTimeout(500);
  }

  const dialogText = await page
    .locator('[role="dialog"]')
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => "");
  throw new Error(
    `Instagram не открыл окно выбора видео после «Создать»${dialogText ? `: ${dialogText.slice(0, 250)}` : ""}`,
  );
}

async function dismissSampleModal(page) {
  await domClickButton(page, SELECTORS.gotItButtonText);

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

async function clickNext(page) {
  await dismissSampleModal(page);
  await dismissPromoDialogs(page);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await dismissSampleModal(page);
    await dismissPromoDialogs(page);

    const clicked = await page.evaluate(() => {
      if (
        document.querySelector(
          '[data-visualcompletion="loading-state"], [role="progressbar"], [aria-busy="true"]',
        )
      ) {
        return false;
      }

      const buttons = document.querySelectorAll('[role="button"], button, div[role="button"]');
      for (const button of buttons) {
        const text = (button.textContent || "").trim();
        if (!/^(Далее|Next|Продолжить)$/.test(text)) continue;
        if (
          button.getAttribute("aria-disabled") === "true" ||
          (button instanceof HTMLButtonElement && button.disabled)
        ) {
          continue;
        }
        const rect = button.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        button.click();
        return true;
      }
      return false;
    });

    if (clicked) return;
    await page.waitForTimeout(1000);
  }

  throw new Error("Не найдена активная кнопка «Далее» после обработки видео.");
}

async function fillCaption(page, caption) {
  const filled = await page.evaluate((text) => {
    const editor = document.querySelector(
      'div[contenteditable="true"], textarea[aria-label*="caption"], textarea[placeholder*="caption"], textarea[placeholder*="Напишите подпись"], textarea[aria-label*="Write a caption"]',
    );
    if (!editor) return false;

    editor.focus();
    if (editor instanceof HTMLTextAreaElement) {
      editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    editor.textContent = text;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    return true;
  }, caption);

  if (!filled) return;

  await page.waitForTimeout(300);
}

async function getPublishState(page) {
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

async function waitForPublishComplete(page) {
  const startedAt = Date.now();
  const deadline = startedAt + PUBLISH_WAIT_TIMEOUT_MS;
  let leftComposeStreak = 0;

  while (Date.now() < deadline) {
    const state = await getPublishState(page);
    const minWaitDone = Date.now() - startedAt >= PUBLISH_MIN_WAIT_MS;

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

    await page.waitForTimeout(PUBLISH_POLL_MS);
  }

  const finalState = await getPublishState(page);
  if (finalState.onComposeScreen || finalState.headerPublishVisible) {
    throw new Error(
      "Instagram не подтвердил публикацию Reels — экран «Новое видео Reels» всё ещё открыт.",
    );
  }

  const remaining = PUBLISH_MIN_WAIT_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await page.waitForTimeout(remaining);
  }
}

async function clickShare(page) {
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
    page.getByRole("button", { name: SELECTORS.shareButtonText }).first(),
    page.locator('div[role="button"]').filter({ hasText: SELECTORS.shareButtonText }).first(),
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

async function runUpload(paramsFile) {
  const params = await readJsonFile(paramsFile);
  const { storageState, filePath, caption, proxy, headless = true } = params;
  let browser;

  try {
    browser = await launchBrowser(proxy, Boolean(headless));
    const context = await browser.newContext({
      storageState,
      locale: "ru-RU",
    });
    await context.route("**/*", async (route) => {
      const type = route.request().resourceType();
      if (type === "media" || type === "font") {
        await route.abort();
      } else {
        await route.continue();
      }
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const silence = (el) => {
        try {
          el.muted = true;
          el.volume = 0;
          el.defaultMuted = true;
        } catch {}
      };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        silence(this);
        return play.apply(this, args);
      };
      const observe = () => {
        document.querySelectorAll("video, audio").forEach((node) => silence(node));
      };
      if (document.documentElement) {
        new MutationObserver(observe).observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
      observe();
      document.addEventListener("DOMContentLoaded", observe, true);
    });

    await page.goto(SELECTORS.reelsUrl, {
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
    await page.waitForTimeout(750);
    await attachVideo(page, filePath);

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

    await context.close().catch(() => {});
    process.stdout.write(JSON.stringify({ ok: true }));
  } finally {
    await browser?.close().catch(() => {});
  }
}

const { command, proxyFile, paramsFile } = parseArgs(process.argv.slice(2));

try {
  if (command === "login") {
    await runLogin(proxyFile);
  } else if (command === "upload") {
    if (!paramsFile) {
      throw new Error("upload requires --params-file");
    }
    await runUpload(paramsFile);
  } else {
    throw new Error(`Unknown command: ${command ?? "(none)"}. Use login or upload.`);
  }
} catch (err) {
  process.stderr.write(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
