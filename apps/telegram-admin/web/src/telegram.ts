import WebApp from "@twa-dev/sdk";

const INIT_WAIT_MS = 2500;
const INIT_POLL_MS = 100;

/** Read initData from Telegram WebApp API or URL hash (tgWebAppData). */
export function readInitData(): string {
  const fromSdk = WebApp.initData?.trim() || window.Telegram?.WebApp?.initData?.trim();
  if (fromSdk) return fromSdk;

  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const params = new URLSearchParams(hash);
    const fromHash = params.get("tgWebAppData")?.trim();
    if (fromHash) return fromHash;
  }

  const search = new URLSearchParams(window.location.search);
  const fromQuery = search.get("tgWebAppData")?.trim();
  if (fromQuery) return fromQuery;

  return "";
}

export function isInsideTelegram(): boolean {
  return Boolean(readInitData() || window.Telegram?.WebApp?.platform);
}

export function bootstrapTelegram(): void {
  try {
    WebApp.ready();
    WebApp.expand();
    try {
      WebApp.setHeaderColor("secondary_bg_color");
    } catch {
      // older clients
    }
    try {
      WebApp.setBackgroundColor("bg_color");
    } catch {
      // older clients
    }
  } catch (error) {
    console.warn("[telegram-admin] WebApp bootstrap failed", error);
  }
}

/** Wait until Telegram injects initData (some clients are late). */
export async function waitForInitData(timeoutMs = INIT_WAIT_MS): Promise<string> {
  const existing = readInitData();
  if (existing) return existing;

  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const value = readInitData();
      if (value || Date.now() - started >= timeoutMs) {
        resolve(value);
        return;
      }
      window.setTimeout(tick, INIT_POLL_MS);
    };
    tick();
  });
}

export function telegramDebugInfo(): string {
  const tg = window.Telegram?.WebApp;
  const platform = tg?.platform ?? "?";
  const version = tg?.version ?? "?";
  const initLen = readInitData().length;
  const hashHasData = window.location.hash.includes("tgWebAppData");
  return `platform=${platform} version=${version} initData=${initLen}b hash=${hashHasData}`;
}

export { WebApp };
