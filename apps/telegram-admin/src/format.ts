import type { LicenseAdminSummary } from "@autouploader/shared";
import type { LicenseEvent } from "./license-api.js";

const statusLabels: Record<LicenseAdminSummary["status"], string> = {
  unactivated: "не активирован",
  active: "активен",
  expired: "истёк",
  revoked: "отозван",
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", { timeZone: "UTC" }) + " UTC";
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function formatLicense(license: LicenseAdminSummary): string {
  const lines = [
    `<b>${escapeHtml(license.customerName)}</b>`,
    `Статус: <b>${statusLabels[license.status]}</b>`,
    `Префикс: <code>${escapeHtml(license.keyPrefix)}</code>`,
    `ID: <code>${escapeHtml(shortId(license.id))}</code>…`,
    `План: ${escapeHtml(license.plan)} · ${license.durationDays} дн.`,
    `Устройство: ${license.deviceBound ? "привязано" : "нет"}`,
    `Активация: ${formatDate(license.activatedAt)}`,
    `Истекает: ${formatDate(license.expiresAt)}`,
  ];
  if (license.customerContact) {
    lines.splice(1, 0, `Контакт: ${escapeHtml(license.customerContact)}`);
  }
  if (license.notes) {
    lines.push(`Заметки: ${escapeHtml(license.notes)}`);
  }
  return lines.join("\n");
}

export function formatLicenseList(licenses: LicenseAdminSummary[], limit = 20): string {
  if (licenses.length === 0) return "Лицензий не найдено.";
  const rows = licenses.slice(0, limit).map((license, index) => {
    const status = statusLabels[license.status];
    const contact = license.customerContact ? ` · ${license.customerContact}` : "";
    return (
      `${index + 1}. <code>${escapeHtml(license.keyPrefix)}</code> · ` +
      `<b>${escapeHtml(license.customerName)}</b>${escapeHtml(contact)}\n` +
      `   ${status} · ${escapeHtml(license.plan)} · до ${formatDate(license.expiresAt)}`
    );
  });
  const more = licenses.length > limit
    ? `\n\n…ещё ${licenses.length - limit}. Уточни поиск: /licenses имя`
    : "";
  return `Найдено: <b>${licenses.length}</b>\n\n${rows.join("\n")}${more}`;
}

export function formatEvents(events: LicenseEvent[], limit = 15): string {
  if (events.length === 0) return "Событий пока нет.";
  return events.slice(0, limit).map((event) => {
    const details = event.details ? ` ${JSON.stringify(event.details)}` : "";
    return (
      `• <code>${escapeHtml(event.event_type)}</code> · ${formatDate(event.created_at)}` +
      (details ? `\n  <i>${escapeHtml(details)}</i>` : "")
    );
  }).join("\n");
}

export const HELP_TEXT = [
  "<b>ROAD License Admin Bot</b>",
  "",
  "Кнопка <b>«Открыть админку»</b> / меню бота — Mini App с полным UI.",
  "/app — открыть Mini App",
  "",
  "/licenses [поиск] — список лицензий",
  "/show &lt;префикс|id&gt; — детали + кнопки",
  "/new — создать ключ (мастер)",
  "/extend &lt;префикс|id&gt; &lt;дней&gt;",
  "/revoke &lt;префикс|id&gt;",
  "/restore &lt;префикс|id&gt;",
  "/reset &lt;префикс|id&gt; — сброс устройства",
  "/events &lt;префикс|id&gt;",
  "/cancel — отменить мастер /new",
  "",
  "Префикс ключа — первые 8 символов (как в админке).",
].join("\n");
