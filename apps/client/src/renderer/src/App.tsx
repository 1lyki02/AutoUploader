import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { AppShell, type ViewId } from "@/components/app-shell";
import type { AccountSummary, LicenseClientState, ProxyConfig, UploadJobSummary, UploadTransferProgress } from "@/env.d.ts";
import type { PrivacyStatus, VideoDraft } from "@/model";
import { usePreferences } from "@/lib/preferences";
import { useAppUpdater } from "@/hooks/use-app-updater";
import { fileName, titleFromPath } from "@/lib/utils";
import { AccountsView } from "@/views/AccountsView";
import { ActivationView } from "@/views/ActivationView";
import { DashboardView } from "@/views/DashboardView";
import { PublishView } from "@/views/PublishView";
import { QueueView } from "@/views/QueueView";

type ConnectPlatform = "youtube" | "tiktok" | "instagram";
type ScheduleMode = "now" | "scheduled";

function defaultScheduledLocal(): string {
  const value = new Date(Date.now() + 10 * 60 * 1000);
  value.setSeconds(0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function App() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<ConnectPlatform | null>(null);
  const [videos, setVideos] = useState<VideoDraft[]>([]);
  const [defaultTitle, setDefaultTitle] = useState("");
  const [defaultDescription, setDefaultDescription] = useState("");
  const [defaultPrivacy, setDefaultPrivacy] = useState<PrivacyStatus>("private");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduledAtLocal, setScheduledAtLocal] = useState(defaultScheduledLocal);
  const [jobs, setJobs] = useState<UploadJobSummary[]>([]);
  const [batchJobIds, setBatchJobIds] = useState<string[]>([]);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadTransferProgress | null>(null);
  const [license, setLicense] = useState<LicenseClientState | null>(null);
  const [licenseBusy, setLicenseBusy] = useState(false);
  const { preferences, update: updatePreferences } = usePreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  useAppUpdater();

  const refreshAccounts = async () => {
    const next = await window.api.accounts.list();
    setAccounts(next);
    setSelectedAccountIds((current) => current.filter((id) => next.some((account) => account.id === id)));
  };
  const refreshJobs = async () => setJobs(await window.api.jobs.list());

  useEffect(() => {
    void refreshAccounts().catch((error: Error) => toast.error("Не удалось загрузить аккаунты", { description: error.message }));
    void refreshJobs().catch((error: Error) => toast.error("Не удалось загрузить очередь", { description: error.message }));
    const removeJobProgress = window.api.jobs.onProgress((updated) => {
      setJobs((current) => {
        const previous = current.find((job) => job.id === updated.id);
        if (previous && previous.status !== updated.status) {
          const prefs = preferencesRef.current;
          if (updated.status === "done" && prefs.notifyOnDone) {
            toast.success("Публикация завершена", {
              description: `${updated.accountLabel} · ${fileName(updated.filePath)}`,
            });
          }
          if (
            prefs.notifyOnFailed
            && ["failed", "needs_review", "reauth_required", "missed"].includes(updated.status)
          ) {
            toast.error("Проблема с публикацией", {
              description: updated.lastError || `${updated.accountLabel} · ${fileName(updated.filePath)}`,
            });
          }
        }
        return current.some((job) => job.id === updated.id)
          ? current.map((job) => (job.id === updated.id ? updated : job))
          : [updated, ...current];
      });
    });
    const removeUploadProgress = window.api.jobs.onUploadProgress(setUploadProgress);
    return () => {
      removeJobProgress();
      removeUploadProgress();
    };
  }, []);

  useEffect(() => {
    void window.api.license.status().then(setLicense).catch((error: Error) => {
      toast.error("Не удалось прочитать лицензию", { description: error.message });
    });
    const timer = window.setInterval(() => {
      void window.api.license.refresh().then(setLicense).catch(() => {});
    }, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleJobs = useMemo(() => {
    if (!batchJobIds.length) return jobs.slice(0, 100);
    const ids = new Set(batchJobIds);
    return jobs.filter((job) => ids.has(job.id));
  }, [batchJobIds, jobs]);

  const connect = async (platform: ConnectPlatform) => {
    if (platform === "youtube") {
      try {
        const oauth = await window.api.youtube.getOAuthClient();
        if (!oauth.configured) {
          toast.warning("Сначала настройте YouTube API", {
            description: "Откройте Настройки и вставьте Client ID / Client Secret из Google Cloud.",
          });
          window.dispatchEvent(new Event("road:open-settings"));
          return;
        }
      } catch (error) {
        toast.error("Не удалось проверить YouTube API", { description: (error as Error).message });
        return;
      }
    }

    setConnecting(platform);
    const toastId = toast.loading(`Подключаем ${platform}…`, { description: "Завершите вход в открывшемся окне браузера." });
    try {
      if (platform === "youtube") await window.api.accounts.connectYoutube("YouTube");
      if (platform === "tiktok") await window.api.accounts.connectTiktok("TikTok");
      if (platform === "instagram") await window.api.accounts.connectInstagram("Instagram Reels");
      await refreshAccounts();
      toast.success("Аккаунт подключён", { id: toastId });
    } catch (error) {
      toast.error("Ошибка подключения", { id: toastId, description: (error as Error).message });
    } finally {
      setConnecting(null);
    }
  };

  const pickFiles = async () => {
    try {
      const paths = await window.api.video.pickFiles();
      setVideos((current) => {
        const known = new Set(current.map((video) => video.filePath));
        return [...current, ...paths.filter((path) => !known.has(path)).map((filePath) => ({
          id: crypto.randomUUID(),
          filePath,
          title: "",
          description: "",
          privacyStatus: "" as const,
        }))];
      });
    } catch (error) {
      toast.error("Не удалось выбрать видео", { description: (error as Error).message });
    }
  };

  const toggleAccount = (accountId: string, selected: boolean) =>
    setSelectedAccountIds((current) => selected ? [...new Set([...current, accountId])] : current.filter((id) => id !== accountId));

  const startBatch = async () => {
    if (!videos.length || !selectedAccountIds.length) {
      toast.warning("Добавьте видео и выберите аккаунты");
      return;
    }

    let scheduledAt: string | undefined;
    if (scheduleMode === "scheduled") {
      const selectedDate = new Date(scheduledAtLocal);
      if (Number.isNaN(selectedDate.getTime()) || selectedDate.getTime() <= Date.now()) {
        toast.warning("Выберите будущее время публикации");
        return;
      }
      scheduledAt = selectedDate.toISOString();
    }

    setCreatingBatch(true);
    setUploadProgress(null);
    try {
      const created = await window.api.jobs.createBatch({
        accountIds: selectedAccountIds,
        videos: videos.map((video) => ({
          filePath: video.filePath,
          title: video.title.trim() || defaultTitle.trim() || titleFromPath(video.filePath),
          description: video.description.trim() || defaultDescription.trim() || undefined,
          privacyStatus: video.privacyStatus || defaultPrivacy,
        })),
        scheduledAt,
      });
      setBatchJobIds(created.map((job) => job.id));
      setJobs((current) => {
        const ids = new Set(created.map((job) => job.id));
        return [...created, ...current.filter((job) => !ids.has(job.id))];
      });
      if (preferencesRef.current.openQueueOnStart) setActiveView("queue");
      toast.success(`Создано заданий: ${created.length}`, {
        description: scheduledAt
          ? `Публикация начнётся ${new Date(scheduledAt).toLocaleString("ru-RU")}.`
          : "Загрузка запущена и обновляется автоматически.",
      });
    } catch (error) {
      toast.error("Не удалось запустить очередь", { description: (error as Error).message });
    } finally {
      setCreatingBatch(false);
      setUploadProgress(null);
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      const updated = await window.api.jobs.retry(jobId);
      setJobs((current) => current.map((job) => (job.id === jobId ? updated : job)));
      toast.success("Задание возвращено в очередь");
    } catch (error) {
      toast.error("Не удалось повторить", { description: (error as Error).message });
    }
  };

  const saveProxy = async (accountId: string, proxy: ProxyConfig | null) => {
    try {
      await window.api.accounts.updateProxy(accountId, proxy);
      await refreshAccounts();
      toast.success(proxy ? "Прокси сохранён" : "Прокси отключён");
    } catch (error) {
      toast.error("Не удалось сохранить прокси", { description: (error as Error).message });
      throw error;
    }
  };

  const deleteAccount = async (accountId: string) => {
    try {
      await window.api.accounts.delete(accountId);
      await refreshAccounts();
      toast.success("Аккаунт удалён");
    } catch (error) {
      toast.error("Не удалось удалить аккаунт", { description: (error as Error).message });
    }
  };

  const activateLicense = async (key: string) => {
    setLicenseBusy(true);
    try {
      const next = await window.api.license.activate(key);
      setLicense(next);
      if (next.status === "active") toast.success("Лицензия активирована");
    } catch (error) {
      toast.error("Ошибка активации", { description: (error as Error).message });
    } finally {
      setLicenseBusy(false);
    }
  };

  const refreshLicense = async () => {
    setLicenseBusy(true);
    try {
      setLicense(await window.api.license.refresh());
      toast.success("Лицензия обновлена");
    } catch (error) {
      toast.error("Ошибка проверки", { description: (error as Error).message });
    } finally {
      setLicenseBusy(false);
    }
  };

  const openActivation = async () => {
    setLicenseBusy(true);
    try {
      setLicense(await window.api.license.deactivate());
    } catch (error) {
      toast.error("Не удалось открыть активацию", { description: (error as Error).message });
    } finally {
      setLicenseBusy(false);
    }
  };

  if (!license) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Проверяем лицензию…</div>;
  }

  if (license.status !== "active") {
    return (
      <>
        <ActivationView
          license={license}
          busy={licenseBusy}
          onActivate={(key) => void activateLicense(key)}
          onRefresh={() => void refreshLicense()}
        />
        <Toaster theme="dark" position="bottom-right" richColors />
      </>
    );
  }

  return (
    <>
      <AppShell
        activeView={activeView}
        onNavigate={setActiveView}
        runningCount={jobs.filter((job) => job.status === "running").length}
        accountCount={accounts.length}
        license={license}
        jobs={jobs}
        preferences={preferences}
        onPreferencesChange={updatePreferences}
        onRefreshLicense={() => void refreshLicense()}
        onOpenActivation={() => void openActivation()}
        licenseBusy={licenseBusy}
      >
        {activeView === "dashboard" && <DashboardView accounts={accounts} jobs={jobs} onNavigate={setActiveView} />}
        {activeView === "publish" && (
          <PublishView
            accounts={accounts}
            selectedAccountIds={selectedAccountIds}
            videos={videos}
            defaultTitle={defaultTitle}
            defaultDescription={defaultDescription}
            defaultPrivacy={defaultPrivacy}
            scheduleMode={scheduleMode}
            scheduledAtLocal={scheduledAtLocal}
            creatingBatch={creatingBatch}
            uploadProgress={uploadProgress}
            onPickFiles={() => void pickFiles()}
            onClearVideos={() => setVideos([])}
            onRemoveVideo={(id) => setVideos((current) => current.filter((video) => video.id !== id))}
            onUpdateVideo={(id, patch) => setVideos((current) => current.map((video) => video.id === id ? { ...video, ...patch } : video))}
            onToggleAccount={toggleAccount}
            onDefaultTitle={setDefaultTitle}
            onDefaultDescription={setDefaultDescription}
            onDefaultPrivacy={setDefaultPrivacy}
            onScheduleMode={setScheduleMode}
            onScheduledAtLocal={setScheduledAtLocal}
            onStart={() => void startBatch()}
            onGoAccounts={() => setActiveView("accounts")}
          />
        )}
        {activeView === "queue" && <QueueView jobs={visibleJobs} currentBatchActive={batchJobIds.length > 0} onShowHistory={() => setBatchJobIds([])} onRefresh={() => void refreshJobs()} onRetry={(id) => void retryJob(id)} />}
        {activeView === "accounts" && (
          <AccountsView
            accounts={accounts}
            selectedAccountIds={selectedAccountIds}
            connecting={connecting}
            onConnect={(platform) => void connect(platform)}
            onToggle={toggleAccount}
            onToggleAll={() => setSelectedAccountIds(selectedAccountIds.length === accounts.length ? [] : accounts.map((account) => account.id))}
            onSaveProxy={saveProxy}
            onDelete={deleteAccount}
          />
        )}
      </AppShell>
      <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ style: { background: "var(--popover)", borderColor: "var(--border)", color: "var(--foreground)" } }} />
    </>
  );
}
