import {
  Bell,
  Copy,
  Download,
  ExternalLink,
  Mail,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LicenseClientState, UploadJobSummary } from "@/env.d.ts";
import { Button, ConfirmDialog, Dialog, Input } from "@/components/ui";
import { checkForAppUpdates } from "@/hooks/use-app-updater";
import { APP_ABOUT, SUPPORT_CONTACTS } from "@/lib/support";
import type { AppPreferences } from "@/lib/preferences";
import { cn, fileName } from "@/lib/utils";

type HeaderPanel = "notifications" | "settings" | "profile" | null;

type YoutubeOAuthStatus = Awaited<ReturnType<typeof window.api.youtube.getOAuthClient>>;

const jobStatusLabel: Record<UploadJobSummary["status"], string> = {
  pending: "В очереди",
  running: "В процессе",
  done: "Готово",
  failed: "Ошибка",
  missed: "Пропущено",
  needs_review: "Нужна проверка",
  reauth_required: "Нужен вход",
};

const licenseStatusLabel: Record<LicenseClientState["status"], string> = {
  unactivated: "Не активирована",
  active: "Активна",
  expired: "Истекла",
  invalid: "Недействительна",
  revoked: "Отозвана",
  already_activated: "Уже активирована",
  configuration_error: "Ошибка конфигурации",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/70 bg-background/25 p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 size-4 accent-[var(--primary)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function HeaderActions({
  license,
  jobs,
  preferences,
  onPreferencesChange,
  onRefreshLicense,
  onOpenActivation,
  licenseBusy,
}: {
  license: LicenseClientState;
  jobs: UploadJobSummary[];
  preferences: AppPreferences;
  onPreferencesChange: (patch: Partial<AppPreferences>) => void;
  onRefreshLicense: () => void;
  onOpenActivation: () => void;
  licenseBusy: boolean;
}) {
  const [panel, setPanel] = useState<HeaderPanel>(null);
  const [copied, setCopied] = useState(false);
  const [confirmChangeKey, setConfirmChangeKey] = useState(false);
  const [youtubeStatus, setYoutubeStatus] = useState<YoutubeOAuthStatus | null>(null);
  const [youtubeClientId, setYoutubeClientId] = useState("");
  const [youtubeClientSecret, setYoutubeClientSecret] = useState("");
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [youtubeMessage, setYoutubeMessage] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    void window.api.updater.version().then(setAppVersion).catch(() => undefined);
  }, []);

  const notifications = useMemo(() => {
    return [...jobs]
      .filter((job) => ["failed", "done", "needs_review", "reauth_required", "missed"].includes(job.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 12);
  }, [jobs]);

  const unreadErrors = jobs.filter((job) =>
    ["failed", "needs_review", "reauth_required", "missed"].includes(job.status)).length;

  const loadYoutubeStatus = async () => {
    const status = await window.api.youtube.getOAuthClient();
    setYoutubeStatus(status);
    setYoutubeClientId(status.clientId ?? "");
    setYoutubeClientSecret("");
  };

  useEffect(() => {
    const openSettings = () => setPanel("settings");
    window.addEventListener("road:open-settings", openSettings);
    return () => window.removeEventListener("road:open-settings", openSettings);
  }, []);

  useEffect(() => {
    if (panel !== "settings") return;
    void loadYoutubeStatus().catch(() => {
      setYoutubeStatus({
        configured: false,
        source: "none",
        clientId: null,
        clientSecretMasked: null,
      });
    });
  }, [panel]);

  const copyInstallId = async () => {
    await navigator.clipboard.writeText(license.installId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const saveYoutube = async () => {
    setYoutubeBusy(true);
    setYoutubeMessage(null);
    try {
      if (!youtubeClientId.trim() || !youtubeClientSecret.trim()) {
        throw new Error("Укажите Client ID и Client Secret");
      }
      const next = await window.api.youtube.setOAuthClient({
        clientId: youtubeClientId,
        clientSecret: youtubeClientSecret,
      });
      setYoutubeStatus(next);
      setYoutubeClientSecret("");
      setYoutubeMessage("YouTube API сохранён. Теперь можно подключать YouTube-аккаунт.");
    } catch (error) {
      setYoutubeMessage((error as Error).message);
    } finally {
      setYoutubeBusy(false);
    }
  };

  const clearYoutube = async () => {
    setYoutubeBusy(true);
    setYoutubeMessage(null);
    try {
      const next = await window.api.youtube.clearOAuthClient();
      setYoutubeStatus(next);
      setYoutubeClientId("");
      setYoutubeClientSecret("");
      setYoutubeMessage("Сохранённые YouTube API ключи удалены.");
    } catch (error) {
      setYoutubeMessage((error as Error).message);
    } finally {
      setYoutubeBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Уведомления"
          onClick={() => setPanel("notifications")}
        >
          <Bell size={17} />
          {unreadErrors > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-400" />
          )}
        </button>
        <button
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Настройки"
          onClick={() => setPanel("settings")}
        >
          <Settings2 size={17} />
        </button>
        <button
          className="ml-1 flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-400 text-[11px] font-bold text-white"
          aria-label="Профиль"
          onClick={() => setPanel("profile")}
        >
          R
        </button>
      </div>

      <Dialog
        open={panel === "notifications"}
        onOpenChange={(open) => setPanel(open ? "notifications" : null)}
        title="Уведомления"
        description="Последние события очереди публикаций."
      >
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {notifications.length ? notifications.map((job) => (
            <div key={job.id} className="rounded-xl border border-border/70 bg-background/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{jobStatusLabel[job.status]}</p>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(job.updatedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {job.accountLabel} · {fileName(job.filePath)}
              </p>
              {job.lastError && (
                <p className="mt-2 flex gap-1.5 text-[11px] leading-4 text-red-300/90">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{job.lastError}</span>
                </p>
              )}
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
              Пока нет событий. Здесь появятся завершения и ошибки загрузок.
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={panel === "settings"}
        onOpenChange={(open) => setPanel(open ? "settings" : null)}
        title="Настройки"
        description="Локальные предпочтения и API-ключи на этом компьютере."
      >
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div className="rounded-xl border border-border/70 bg-background/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">YouTube Data API</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  У каждого пользователя свой Google Cloud проект и OAuth Desktop client.
                  Создайте Client ID / Secret в Google Cloud и вставьте сюда.
                </p>
              </div>
              <span className={cn(
                "shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium",
                youtubeStatus?.configured
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                  : "border-amber-400/20 bg-amber-400/10 text-amber-200",
              )}>
                {youtubeStatus?.configured
                  ? youtubeStatus.source === "env" ? "Из .env" : "Настроено"
                  : "Не задано"}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <label className="grid gap-1.5 text-[11px] font-medium text-muted-foreground">
                Client ID
                <Input
                  value={youtubeClientId}
                  onChange={(event) => setYoutubeClientId(event.target.value)}
                  placeholder="xxxxx.apps.googleusercontent.com"
                  autoComplete="off"
                />
              </label>
              <label className="grid gap-1.5 text-[11px] font-medium text-muted-foreground">
                Client Secret
                <Input
                  type="password"
                  value={youtubeClientSecret}
                  onChange={(event) => setYoutubeClientSecret(event.target.value)}
                  placeholder={youtubeStatus?.clientSecretMasked ?? "GOCSPX-…"}
                  autoComplete="off"
                />
              </label>
            </div>

            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
              Google Cloud → APIs & Services → Credentials → OAuth client ID → Desktop app.
              Включите YouTube Data API v3 и добавьте себя в Test users, пока приложение в Testing.
            </p>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
            >
              Открыть Google Cloud Credentials
              <ExternalLink size={11} />
            </a>

            {youtubeMessage && (
              <p className="mt-3 rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                {youtubeMessage}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={youtubeBusy || !youtubeClientId.trim() || !youtubeClientSecret.trim()}
                onClick={() => void saveYoutube()}
              >
                Сохранить
              </Button>
              {youtubeStatus?.source === "settings" && (
                <Button size="sm" variant="ghost" disabled={youtubeBusy} onClick={() => void clearYoutube()}>
                  Очистить
                </Button>
              )}
            </div>
          </div>

          <Toggle
            checked={preferences.notifyOnDone}
            onChange={(value) => onPreferencesChange({ notifyOnDone: value })}
            label="Уведомлять об успехе"
            description="Показывать toast, когда публикация завершилась успешно."
          />
          <Toggle
            checked={preferences.notifyOnFailed}
            onChange={(value) => onPreferencesChange({ notifyOnFailed: value })}
            label="Уведомлять об ошибках"
            description="Показывать toast при сбое, пропуске или необходимости повторного входа."
          />
          <Toggle
            checked={preferences.openQueueOnStart}
            onChange={(value) => onPreferencesChange({ openQueueOnStart: value })}
            label="Открывать очередь после запуска"
            description="После создания партии сразу переходить на экран очереди."
          />
          <div className="rounded-xl border border-border/70 bg-background/25 p-3 text-[11px] leading-5 text-muted-foreground">
            Автозапуск с Windows уже включён для фоновых публикаций. Прокси и площадки
            настраиваются в разделе «Аккаунты».
          </div>
        </div>
      </Dialog>

      <Dialog
        open={panel === "profile"}
        onOpenChange={(open) => setPanel(open ? "profile" : null)}
        title="Профиль"
        description={`${APP_ABOUT.productName} · ${APP_ABOUT.tagline}`}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/25 bg-primary/[0.07] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Подписка</p>
                <p className="mt-2 text-lg font-semibold capitalize">{license.plan ?? "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {license.bypass
                    ? "Режим разработки без сервера лицензий"
                    : `Действует до ${formatDate(license.expiresAt)}`}
                </p>
              </div>
              <span className={cn(
                "rounded-full border px-2 py-1 text-[10px] font-medium",
                license.status === "active"
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                  : "border-amber-400/20 bg-amber-400/10 text-amber-200",
              )}>
                {licenseStatusLabel[license.status]}
              </span>
            </div>
            {license.offlineUntil && !license.bypass && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Офлайн-токен действует до {formatDate(license.offlineUntil)}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={licenseBusy} onClick={onRefreshLicense}>
                <RefreshCw size={13} />Проверить лицензию
              </Button>
              {!license.bypass && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmChangeKey(true)}>
                  <ShieldCheck size={13} />Сменить ключ
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/25 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">ID установки</p>
            <p className="mt-2 break-all font-mono text-[11px] leading-5 text-foreground/90">{license.installId}</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => void copyInstallId()}>
              <Copy size={13} />{copied ? "Скопировано" : "Копировать ID"}
            </Button>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/25 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Версия приложения</p>
            <p className="mt-2 text-sm font-medium">{appVersion ? `v${appVersion}` : "—"}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Обновления скачиваются автоматически. После загрузки появится кнопка перезапуска.
            </p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={checkForAppUpdates}>
              <Download size={13} />Проверить обновления
            </Button>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/25 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Обратная связь</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              По вопросам оплаты, продления или сброса устройства напишите нам:
            </p>
            <div className="mt-3 space-y-2">
              <a
                href={SUPPORT_CONTACTS.telegram.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5 text-sm transition-colors hover:border-primary/35 hover:bg-accent/40"
              >
                <Send size={15} className="text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-muted-foreground">{SUPPORT_CONTACTS.telegram.label}</span>
                  <span className="font-medium">{SUPPORT_CONTACTS.telegram.value}</span>
                </span>
                <ExternalLink size={13} className="text-muted-foreground" />
              </a>
              <a
                href={SUPPORT_CONTACTS.email.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5 text-sm transition-colors hover:border-primary/35 hover:bg-accent/40"
              >
                <Mail size={15} className="text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-muted-foreground">{SUPPORT_CONTACTS.email.label}</span>
                  <span className="font-medium">{SUPPORT_CONTACTS.email.value}</span>
                </span>
                <ExternalLink size={13} className="text-muted-foreground" />
              </a>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmChangeKey}
        onOpenChange={setConfirmChangeKey}
        title="Сменить лицензионный ключ?"
        description="Текущий ключ будет сброшен на этом устройстве. Публикации станут недоступны, пока вы не активируете новый ключ."
        confirmLabel="Сменить ключ"
        confirmVariant="default"
        onConfirm={() => {
          setConfirmChangeKey(false);
          setPanel(null);
          onOpenActivation();
        }}
      />
    </>
  );
}
