import { useEffect, useMemo, useState } from "react";
import type {
  GenerateLicenseRequest,
  LicenseAdminAction,
  LicenseAdminSummary,
} from "@autouploader/shared";

interface LicenseEvent {
  id: number;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

const statusLabels: Record<LicenseAdminSummary["status"], string> = {
  unactivated: "Не активирован",
  active: "Активен",
  expired: "Истёк",
  revoked: "Отозван",
};

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString("ru-RU") : "—";
}

export function App() {
  const [licenses, setLicenses] = useState<LicenseAdminSummary[]>([]);
  const [selected, setSelected] = useState<LicenseAdminSummary | null>(null);
  const [events, setEvents] = useState<LicenseEvent[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [form, setForm] = useState<GenerateLicenseRequest>({
    customerName: "",
    customerContact: "",
    plan: "pro",
    durationDays: 30,
    notes: "",
  });

  const refresh = async () => {
    setError("");
    try {
      if (!window.adminApi) {
    throw new Error(
      "Admin API не загружен. Закройте вкладку браузера и используйте только окно Electron, которое открывает pnpm dev:admin.",
    );
  }
      const rows = await window.adminApi.list();
      setLicenses(rows);
      setSelected((current) => current
        ? rows.find((row) => row.id === current.id) ?? null
        : null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  useEffect(() => {
    if (!window.adminApi) {
      setError(
        "Admin API не загружен. Закройте вкладку браузера и используйте только окно Electron, которое открывает pnpm dev:admin.",
      );
      return;
    }
    void refresh();
  }, []);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    void window.adminApi.events(selected.id)
      .then((items) => setEvents(items as LicenseEvent[]))
      .catch(() => setEvents([]));
  }, [selected?.id]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return licenses;
    return licenses.filter((license) =>
      `${license.customerName} ${license.customerContact ?? ""} ${license.keyPrefix} ${license.status}`
        .toLowerCase()
        .includes(query));
  }, [licenses, search]);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      if (!window.adminApi) {
    throw new Error(
      "Admin API не загружен. Закройте вкладку браузера и используйте только окно Electron, которое открывает pnpm dev:admin.",
    );
  }
      const result = await window.adminApi.generate(form);
      setCreatedKey(result.licenseKey);
      setForm({ ...form, customerName: "", customerContact: "", notes: "" });
      await refresh();
      setSelected(result.license);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: LicenseAdminAction) => {
    setBusy(true);
    setError("");
    try {
      const updated = await window.adminApi.action(action);
      await refresh();
      setSelected(updated);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const extend = () => {
    if (!selected) return;
    const value = window.prompt("На сколько дней продлить?", "30");
    const days = Number(value);
    if (Number.isInteger(days) && days > 0) {
      void runAction({ action: "extend", licenseId: selected.id, days });
    }
  };

  return (
    <div className="app">
      <header>
        <div>
          <p className="eyebrow">PRIVATE TOOL</p>
          <h1>ROAD License Admin</h1>
        </div>
        <button className="secondary" onClick={() => void refresh()} disabled={busy}>
          Обновить
        </button>
      </header>

      {error && <div className="error">{error}</div>}
      {createdKey && (
        <div className="created-key">
          <div>
            <strong>Ключ создан — сохраните его сейчас</strong>
            <code>{createdKey}</code>
          </div>
          <button onClick={() => void navigator.clipboard.writeText(createdKey)}>Копировать</button>
          <button className="secondary" onClick={() => setCreatedKey("")}>Закрыть</button>
        </div>
      )}

      <div className="layout">
        <aside className="panel create-panel">
          <h2>Новая лицензия</h2>
          <label>Покупатель<input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} /></label>
          <label>Контакт<input value={form.customerContact ?? ""} onChange={(event) => setForm({ ...form, customerContact: event.target.value })} placeholder="Telegram, email" /></label>
          <div className="form-row">
            <label>Тариф<input value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} /></label>
            <label>Дней<input type="number" min={1} max={3650} value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })} /></label>
          </div>
          <div className="quick-days">
            {[30, 90, 365].map((days) => <button key={days} className="secondary" onClick={() => setForm({ ...form, durationDays: days })}>{days} дней</button>)}
          </div>
          <label>Заметка<textarea rows={4} value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <button disabled={busy || !form.customerName.trim()} onClick={() => void generate()}>
            {busy ? "Выполняется…" : "Создать ключ"}
          </button>
        </aside>

        <section className="panel list-panel">
          <div className="panel-title">
            <div><h2>Лицензии</h2><span>{licenses.length} всего</span></div>
            <input className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск…" />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Клиент</th><th>Ключ</th><th>Статус</th><th>Срок</th></tr></thead>
              <tbody>
                {visible.map((license) => (
                  <tr key={license.id} className={selected?.id === license.id ? "selected" : ""} onClick={() => setSelected(license)}>
                    <td><strong>{license.customerName}</strong><small>{license.customerContact ?? "Без контакта"}</small></td>
                    <td><code>{license.keyPrefix}…</code></td>
                    <td><span className={`status ${license.status}`}>{statusLabels[license.status]}</span></td>
                    <td>{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString("ru-RU") : `${license.durationDays} дней после активации`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && <p className="empty">Лицензий пока нет</p>}
          </div>
        </section>

        <aside className="panel detail-panel">
          {selected ? (
            <>
              <h2>{selected.customerName}</h2>
              <dl>
                <dt>Префикс</dt><dd><code>{selected.keyPrefix}…</code></dd>
                <dt>Тариф</dt><dd>{selected.plan}</dd>
                <dt>Активирован</dt><dd>{date(selected.activatedAt)}</dd>
                <dt>Действует до</dt><dd>{date(selected.expiresAt)}</dd>
                <dt>Устройство</dt><dd>{selected.deviceBound ? "Привязано" : "Не привязано"}</dd>
                <dt>Заметка</dt><dd>{selected.notes ?? "—"}</dd>
              </dl>
              <div className="actions">
                <button onClick={extend} disabled={busy}>Продлить</button>
                {selected.status === "revoked"
                  ? <button onClick={() => void runAction({ action: "restore", licenseId: selected.id })}>Восстановить</button>
                  : <button className="danger" onClick={() => void runAction({ action: "revoke", licenseId: selected.id })}>Отозвать</button>}
                <button className="secondary" onClick={() => void runAction({ action: "reset-device", licenseId: selected.id })} disabled={!selected.deviceBound}>Сбросить устройство</button>
              </div>
              <h3>Журнал</h3>
              <div className="events">
                {events.map((event) => <div key={event.id}><strong>{event.event_type}</strong><span>{date(event.created_at)}</span></div>)}
                {!events.length && <p className="empty">Событий нет</p>}
              </div>
            </>
          ) : <p className="empty">Выберите лицензию</p>}
        </aside>
      </div>
    </div>
  );
}
