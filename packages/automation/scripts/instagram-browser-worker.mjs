/**
 * Standalone Instagram browser worker (Camoufox).
 * Run outside Electron main to avoid Windows crashes when spawning Firefox.
 *
 *   node instagram-browser-worker.mjs login [--proxy-file path]
 *   node instagram-browser-worker.mjs upload --params-file path
 *
 * Writes JSON result to stdout; errors go to stderr with exit code 1.
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

async function launchBrowser(proxy, headless = false) {
  const launch = {
    headless,
    os: resolveCamoufoxOs(),
    locale: "ru-RU",
    humanize: true,
    exclude_addons: ["UBO"],
    firefox_user_prefs: {
      "media.volume_scale": "0.0",
      "media.default_volume": 0.0,
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
      viewport: { width: 1920, height: 1080 },
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
  await page
    .getByRole("button", { name: SELECTORS.cookieConsentButtonText })
    .click({ timeout: 3000 })
    .catch(() => {});
}

async function clickCreate(page) {
  const candidates = [
    page.getByRole("link", { name: SELECTORS.createButtonText }).first(),
    page.getByRole("button", { name: SELECTORS.createButtonText }).first(),
    page
      .locator('svg[aria-label="Создать"], svg[aria-label="New post"], svg[aria-label="Create"]')
      .first(),
    page.getByLabel(SELECTORS.createReelsAria).first(),
    page.locator('span:text-is("Создать"), span:text-is("Create")').first(),
  ];

  for (const locator of candidates) {
    if ((await locator.count()) === 0) continue;
    try {
      await locator.click({ timeout: 5000 });
      return;
    } catch {
      // try next
    }
  }

  throw new Error("Не найдена кнопка «Создать» в Instagram.");
}

async function clickReelsOption(page) {
  const candidates = [
    page.getByRole("menuitem", { name: SELECTORS.reelsOptionText }).first(),
    page.getByRole("button", { name: SELECTORS.reelsOptionText }).first(),
    page.getByText(SELECTORS.reelsOptionText, { exact: true }).first(),
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

async function attachVideo(page, filePath) {
  const fileInput = page.locator(SELECTORS.fileInput).first();
  let reelsOptionClicked = false;
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    // In some Instagram layouts Create opens the upload dialog immediately.
    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles(filePath);
      return;
    }

    // In other layouts Create first opens a Post/Reels menu.
    if (!reelsOptionClicked) {
      reelsOptionClicked = await clickReelsOption(page);
    }

    // A/B variants create the input only after clicking this visible button.
    const selectButton = page
      .getByRole("button", {
        name: /Выбрать на компьютере|Выбрать с компьютера|Select from computer/i,
      })
      .first();

    if ((await selectButton.count()) > 0) {
      const chooserPromise = page.waitForEvent("filechooser", { timeout: 10_000 });
      await selectButton.click({ timeout: 5000 });
      const chooser = await chooserPromise;
      await chooser.setFiles(filePath);
      return;
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
  await page
    .getByRole("button", { name: SELECTORS.gotItButtonText })
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

async function clickNext(page) {
  const candidates = [
    page.getByRole("button", { name: SELECTORS.nextButtonText }).first(),
    page.getByRole("link", { name: SELECTORS.nextButtonText }).first(),
    page.locator('div[role="button"]').filter({ hasText: SELECTORS.nextButtonText }).first(),
    page.getByText(SELECTORS.nextButtonText, { exact: true }).first(),
  ];

  for (const next of candidates) {
    try {
      await next.waitFor({ state: "visible", timeout: 20_000 });
      await next.click({ timeout: 20_000 });
      return;
    } catch {
      // Video may still be processing; try another exact selector.
    }
  }

  throw new Error("Не найдена активная кнопка «Далее» после обработки видео.");
}

async function fillCaption(page, caption) {
  const editor = page.locator(SELECTORS.captionEditor).first();
  if ((await editor.count()) === 0) {
    return;
  }

  await editor.click({ timeout: 5000 });
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type(caption, { delay: 20 });
}

async function clickShare(page) {
  const shareCandidates = [
    page.getByRole("button", { name: SELECTORS.shareButtonText }).first(),
    page
      .locator('div[role="button"]')
      .filter({ hasText: SELECTORS.shareButtonText })
      .first(),
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

async function runUpload(paramsFile) {
  const params = await readJsonFile(paramsFile);
  const { storageState, filePath, caption, proxy, headless = true } = params;

  const browser = await launchBrowser(proxy, Boolean(headless));

  try {
    const context = await browser.newContext({
      storageState,
      viewport: { width: 1920, height: 1080 },
      locale: "ru-RU",
    });
    // The Reels feed downloads many videos and can keep the page busy for
    // minutes. They are not needed to open the upload dialog.
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

    // Open the lightweight home page instead of the video-heavy Reels feed.
    await page.goto(SELECTORS.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(1500);

    if (page.url().includes("/accounts/login") || page.url().includes("/challenge")) {
      throw new Error(
        "Instagram session недействительна. Переподключите Instagram-аккаунт и попробуйте снова.",
      );
    }

    await dismissCookieBanner(page);
    await clickCreate(page);
    await page.waitForTimeout(750);
    await attachVideo(page, filePath);

    await page.waitForTimeout(8000);
    await dismissSampleModal(page);
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
    await page.waitForTimeout(30_000);

    await context.close().catch(() => {});
    process.stdout.write(JSON.stringify({ ok: true }));
  } finally {
    await browser.close().catch(() => {});
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
