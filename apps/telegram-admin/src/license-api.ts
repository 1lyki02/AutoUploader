import {
  GenerateLicenseRequestSchema,
  GenerateLicenseResponseSchema,
  LicenseAdminActionSchema,
  LicenseAdminSummarySchema,
  type GenerateLicenseRequest,
  type GenerateLicenseResponse,
  type LicenseAdminAction,
  type LicenseAdminSummary,
} from "@autouploader/shared";
import type { AppConfig } from "./config.js";

export interface LicenseEvent {
  id: number;
  event_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function networkErrorMessage(error: unknown): string {
  const cause = error instanceof Error && "cause" in error
    ? (error as { cause?: { code?: string } }).cause
    : undefined;
  const code = cause?.code ?? "";
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    (error instanceof Error && /fetch failed/i.test(error.message))
  ) {
    return "Нет стабильного соединения с Supabase. Проверь VPN/прокси и повтори.";
  }
  return error instanceof Error ? error.message : String(error);
}

export class LicenseAdminClient {
  constructor(private readonly config: AppConfig) {}

  private async request<T>(query = "", init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("x-admin-token", this.config.licenseAdminToken);
    if (init.body) headers.set("Content-Type", "application/json");

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(`${this.config.licenseAdminUrl}${query}`, {
          ...init,
          headers,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Ошибка сервиса лицензий (${response.status})`);
        }
        return response.json() as Promise<T>;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await sleep(attempt * 700);
      }
    }
    throw new Error(networkErrorMessage(lastError));
  }

  async list(): Promise<LicenseAdminSummary[]> {
    const rows = await this.request<unknown[]>();
    return rows.map((row) => LicenseAdminSummarySchema.parse(row));
  }

  async generate(input: GenerateLicenseRequest): Promise<GenerateLicenseResponse> {
    const request = GenerateLicenseRequestSchema.parse(input);
    return GenerateLicenseResponseSchema.parse(
      await this.request("", {
        method: "POST",
        body: JSON.stringify({ action: "generate", ...request }),
      }),
    );
  }

  async action(input: LicenseAdminAction): Promise<LicenseAdminSummary> {
    const request = LicenseAdminActionSchema.parse(input);
    return LicenseAdminSummarySchema.parse(
      await this.request("", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
  }

  async events(licenseId: string): Promise<LicenseEvent[]> {
    const rows = await this.request<LicenseEvent[]>(
      `?events=${encodeURIComponent(licenseId)}`,
    );
    return Array.isArray(rows) ? rows : [];
  }

  async find(ref: string): Promise<LicenseAdminSummary | null> {
    const query = ref.trim().toLowerCase();
    if (!query) return null;
    const rows = await this.list();
    const byId = rows.find((row) => row.id.toLowerCase() === query);
    if (byId) return byId;
    const byPrefix = rows.filter((row) =>
      row.keyPrefix.toLowerCase().startsWith(query) ||
      row.id.toLowerCase().startsWith(query)
    );
    if (byPrefix.length === 1) return byPrefix[0] ?? null;
    if (byPrefix.length > 1) {
      throw new Error(
        `Найдено несколько лицензий по «${ref}». Уточни префикс или укажи полный id.`,
      );
    }
    return null;
  }

  async require(ref: string): Promise<LicenseAdminSummary> {
    const license = await this.find(ref);
    if (!license) throw new Error(`Лицензия «${ref}» не найдена`);
    return license;
  }
}
