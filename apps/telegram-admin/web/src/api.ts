import type {
  GenerateLicenseRequest,
  GenerateLicenseResponse,
  LicenseAdminAction,
  LicenseAdminSummary,
} from "@autouploader/shared";
import { readInitData } from "./telegram";

export interface LicenseEvent {
  id: number;
  event_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const initData = readInitData();
  if (!initData) {
    throw new Error(
      "Нет initData Telegram. Открой админку кнопкой «Открыть админку» или Menu «Админка» внутри @ROADadmbot — не через браузер.",
    );
  }
  headers.set("Authorization", `tma ${initData}`);
  headers.set("X-Telegram-Init-Data", initData);

  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Ошибка API (${response.status})`);
  }
  return body;
}

export const licenseApi = {
  list(): Promise<LicenseAdminSummary[]> {
    return request("/api/licenses");
  },
  generate(input: GenerateLicenseRequest): Promise<GenerateLicenseResponse> {
    return request("/api/licenses/generate", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  action(input: LicenseAdminAction): Promise<LicenseAdminSummary> {
    return request("/api/licenses/action", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  events(licenseId: string): Promise<LicenseEvent[]> {
    return request(`/api/licenses/${encodeURIComponent(licenseId)}/events`);
  },
};
