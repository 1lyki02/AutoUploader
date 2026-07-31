import { useEffect, useMemo, useState } from "react";
import type {
  GenerateLicenseRequest,
  LicenseAdminAction,
  LicenseAdminSummary,
} from "@autouploader/shared";
import { licenseApi, type LicenseEvent } from "./api";
import { WebApp, readInitData, telegramDebugInfo } from "./telegram";

type Tab = "list" | "create" | "detail";

const statusLabels: Record<LicenseAdminSummary["status"], string> = {
  unactivated: "Не активирован",
  active: "Активен",
  expired: "Истёк",
  revoked: "Отозван",
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("ru-RU") : "—";
}

function haptic(kind: "success" | "error" | "light" = "light") {
  const hf = WebApp.HapticFeedback;
  if (!hf) return;
  if (kind === "success" || kind === "error") {
    hf.notificationOccurred(kind);
  } else {
    hf.impactOccurred("light");
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>("list");
  const [licenses, setLicenses] = useState<LicenseAdminSummary[]>([]);
  const [selected, setSelected] = useState<LicenseAdminSummary | null>(null);
  const [events, setEvents] = useState<LicenseEvent[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [extendDays, setExtendDays] = useState("30");
  const [form, setForm] = useState<GenerateLicenseRequest>({
    customerName: "",
    customerContact: "",
    plan: "pro",
    durationDays: 30,
    notes: "",
  });

  const insideTelegram = Boolean(readInitData());

  const refresh = async () => {
    setError("");
    if (!readInitData()) {
      setError(
        `Нет данных Telegram (${telegramDebugInfo()}). Напиши боту /app и открой кнопкой «Открыть админку».`,
      );
      return;
    }
    try {
      const rows = await licenseApi.list();
      setLicenses(rows);
      setSelected((current) =>
        current ? rows.find((row) => row.id === current.id) ?? null : null,
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const back = WebApp.BackButton;

    const onBack = () => {
      if (tab === "detail") {
        setTab("list");
        setSelected(null);
      } else if (tab === "create") {
        setTab("list");
      }
    };

    if (tab === "detail" || tab === "create") {
      back.show();
      back.onClick(onBack);
    } else {
      back.hide();
    }

    return () => {
      back.offClick(onBack);
      back.hide();
    };
  }, [tab]);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    void licenseApi
      .events(selected.id)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [selected?.id]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return licenses;
    return licenses.filter((license) =>
      `${license.customerName} ${license.customerContact ?? ""} ${license.keyPrefix} ${license.status} ${license.plan}`
        .toLowerCase()
        .includes(query),
    );
  }, [licenses, search]);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await licenseApi.generate(form);
      setCreatedKey(result.licenseKey);
      setForm({ ...form, customerName: "", customerContact: "", notes: "" });
      await refresh();
      setSelected(result.license);
      setTab("detail");
      haptic("success");
    } catch (cause) {
      setError((cause as Error).message);
      haptic("error");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: LicenseAdminAction) => {
    setBusy(true);
    setError("");
    try {
      const updated = await licenseApi.action(action);
      await refresh();
      setSelected(updated);
      haptic("success");
    } catch (cause) {
      setError((cause as Error).message);
      haptic("error");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (license: LicenseAdminSummary) => {
    haptic();
    setSelected(license);
    setTab("detail");
  };

  const copyKey = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      haptic("success");
    } catch {
      WebApp.showAlert?.(createdKey);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">ROAD</p>
          <h1>Лицензии</h1>
        </div>
        <button
          type="button"
          className="icon-btn"
          disabled={busy}
          onClick={() => void refresh()}
          aria-label="Обновить"
        >
          ↻
        </button>
      </header>

      {!insideTelegram && (
        <div className="banner warn">
          Открой через бота: /app → «Открыть админку» (или Menu «Админка»).
          Не открывай ссылку в обычном браузере — Telegram не передаст авторизацию.
          <br />
          <small>{telegramDebugInfo()}</small>
        </div>
      )}

      {error && <div className="banner error">{error}</div>}

      {createdKey && (
        <div className="banner key">
          <strong>Ключ создан — сохрани сейчас</strong>
          <code>{createdKey}</code>
          <div className="row">
            <button type="button" onClick={() => void copyKey()}>
              Копировать
            </button>
            <button type="button" className="secondary" onClick={() => setCreatedKey("")}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {tab === "list" && (
        <section className="panel">
          <div className="toolbar">
            <input
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск…"
            />
            <button type="button" onClick={() => setTab("create")}>
              + Ключ
            </button>
          </div>
          <p className="meta">{licenses.length} всего · показано {visible.length}</p>
          <ul className="license-list">
            {visible.map((license) => (
              <li key={license.id}>
                <button type="button" className="license-card" onClick={() => openDetail(license)}>
                  <div className="license-card-top">
                    <strong>{license.customerName}</strong>
                    <span className={`status ${license.status}`}>
                      {statusLabels[license.status]}
                    </span>
                  </div>
                  <div className="license-card-sub">
                    <code>{license.keyPrefix}…</code>
                    <span>
                      {license.expiresAt
                        ? new Date(license.expiresAt).toLocaleDateString("ru-RU")
                        : `${license.durationDays} дн.`}
                    </span>
                  </div>
                  {license.customerContact && (
                    <small>{license.customerContact}</small>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!visible.length && <p className="empty">Лицензий нет</p>}
        </section>
      )}

      {tab === "create" && (
        <section className="panel form-panel">
          <h2>Новая лицензия</h2>
          <label>
            Покупатель
            <input
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label>
            Контакт
            <input
              value={form.customerContact ?? ""}
              onChange={(e) => setForm({ ...form, customerContact: e.target.value })}
              placeholder="Telegram, email"
              autoComplete="off"
            />
          </label>
          <div className="form-row">
            <label>
              Тариф
              <input
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
              />
            </label>
            <label>
              Дней
              <input
                type="number"
                min={1}
                max={3650}
                value={form.durationDays}
                onChange={(e) =>
                  setForm({ ...form, durationDays: Number(e.target.value) || 1 })
                }
              />
            </label>
          </div>
          <div className="chips">
            {[30, 90, 365].map((days) => (
              <button
                key={days}
                type="button"
                className={form.durationDays === days ? "chip active" : "chip"}
                onClick={() => setForm({ ...form, durationDays: days })}
              >
                {days} дн.
              </button>
            ))}
          </div>
          <label>
            Заметка
            <textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="primary block"
            disabled={busy || !form.customerName.trim()}
            onClick={() => void generate()}
          >
            {busy ? "Создаю…" : "Создать ключ"}
          </button>
        </section>
      )}

      {tab === "detail" && selected && (
        <section className="panel detail-panel">
          <h2>{selected.customerName}</h2>
          <dl className="facts">
            <div>
              <dt>Префикс</dt>
              <dd>
                <code>{selected.keyPrefix}…</code>
              </dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>
                <span className={`status ${selected.status}`}>
                  {statusLabels[selected.status]}
                </span>
              </dd>
            </div>
            <div>
              <dt>Тариф</dt>
              <dd>
                {selected.plan} · {selected.durationDays} дн.
              </dd>
            </div>
            <div>
              <dt>Активирован</dt>
              <dd>{formatDate(selected.activatedAt)}</dd>
            </div>
            <div>
              <dt>Действует до</dt>
              <dd>{formatDate(selected.expiresAt)}</dd>
            </div>
            <div>
              <dt>Устройство</dt>
              <dd>{selected.deviceBound ? "Привязано" : "Не привязано"}</dd>
            </div>
            <div>
              <dt>Контакт</dt>
              <dd>{selected.customerContact ?? "—"}</dd>
            </div>
            <div>
              <dt>Заметка</dt>
              <dd>{selected.notes ?? "—"}</dd>
            </div>
          </dl>

          <div className="extend-row">
            <input
              type="number"
              min={1}
              max={3650}
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              aria-label="Дней продления"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const days = Number(extendDays);
                if (!Number.isInteger(days) || days < 1) {
                  setError("Укажи целое число дней");
                  return;
                }
                void runAction({
                  action: "extend",
                  licenseId: selected.id,
                  days,
                });
              }}
            >
              Продлить
            </button>
          </div>
          <div className="chips">
            {[30, 90].map((days) => (
              <button
                key={days}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() =>
                  void runAction({
                    action: "extend",
                    licenseId: selected.id,
                    days,
                  })
                }
              >
                +{days}
              </button>
            ))}
          </div>

          <div className="actions">
            {selected.status === "revoked" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction({ action: "restore", licenseId: selected.id })
                }
              >
                Восстановить
              </button>
            ) : (
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => {
                  const run = () =>
                    void runAction({ action: "revoke", licenseId: selected.id });
                  WebApp.showConfirm("Отозвать лицензию?", (ok: boolean) => {
                    if (ok) run();
                  });
                }}
              >
                Отозвать
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={busy || !selected.deviceBound}
              onClick={() => {
                const run = () =>
                  void runAction({
                    action: "reset-device",
                    licenseId: selected.id,
                  });
                WebApp.showConfirm("Сбросить привязку устройства?", (ok: boolean) => {
                  if (ok) run();
                });
              }}
            >
              Сбросить ПК
            </button>
          </div>

          <h3>Журнал</h3>
          <div className="events">
            {events.map((event) => (
              <div key={event.id} className="event">
                <strong>{event.event_type}</strong>
                <span>{formatDate(event.created_at)}</span>
              </div>
            ))}
            {!events.length && <p className="empty">Событий нет</p>}
          </div>
        </section>
      )}

      <nav className="tabbar">
        <button
          type="button"
          className={tab === "list" || tab === "detail" ? "active" : ""}
          onClick={() => {
            setTab("list");
            setSelected(null);
          }}
        >
          Список
        </button>
        <button
          type="button"
          className={tab === "create" ? "active" : ""}
          onClick={() => setTab("create")}
        >
          Создать
        </button>
      </nav>
    </div>
  );
}
