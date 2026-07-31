import { CalendarClock, ChevronDown, FileVideo2, Info, Plus, Send, Trash2, UploadCloud, Users, Zap } from "lucide-react";
import { useState } from "react";
import type { AccountSummary, UploadTransferProgress } from "@/env.d.ts";
import type { PrivacyStatus, VideoDraft } from "@/model";
import { PlatformBadge, SectionHeader } from "@/components/shared";
import { Button, Card, EmptyState, Input, Textarea } from "@/components/ui";
import { cn, fileName, titleFromPath } from "@/lib/utils";

export function PublishView({
  accounts,
  selectedAccountIds,
  videos,
  defaultTitle,
  defaultDescription,
  defaultPrivacy,
  scheduleMode,
  scheduledAtLocal,
  creatingBatch,
  uploadProgress,
  onPickFiles,
  onClearVideos,
  onRemoveVideo,
  onUpdateVideo,
  onToggleAccount,
  onDefaultTitle,
  onDefaultDescription,
  onDefaultPrivacy,
  onScheduleMode,
  onScheduledAtLocal,
  onStart,
  onGoAccounts,
}: {
  accounts: AccountSummary[];
  selectedAccountIds: string[];
  videos: VideoDraft[];
  defaultTitle: string;
  defaultDescription: string;
  defaultPrivacy: PrivacyStatus;
  scheduleMode: "now" | "scheduled";
  scheduledAtLocal: string;
  creatingBatch: boolean;
  uploadProgress: UploadTransferProgress | null;
  onPickFiles: () => void;
  onClearVideos: () => void;
  onRemoveVideo: (id: string) => void;
  onUpdateVideo: (id: string, patch: Partial<VideoDraft>) => void;
  onToggleAccount: (id: string, selected: boolean) => void;
  onDefaultTitle: (value: string) => void;
  onDefaultDescription: (value: string) => void;
  onDefaultPrivacy: (value: PrivacyStatus) => void;
  onScheduleMode: (value: "now" | "scheduled") => void;
  onScheduledAtLocal: (value: string) => void;
  onStart: () => void;
  onGoAccounts: () => void;
}) {
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const jobCount = videos.length * selectedAccountIds.length;
  const ready = videos.length > 0 && selectedAccountIds.length > 0;

  return (
    <div className="view-enter pb-24">
      <SectionHeader eyebrow="Новая публикация" title="Подготовка контента" description="Добавьте видео, выберите площадки и настройте метаданные перед запуском." />
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(310px,.7fr)] items-start gap-4">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="font-semibold">Медиафайлы</h2><p className="mt-1 text-xs text-muted-foreground">MP4, MOV или WEBM</p></div>
              {videos.length > 0 && <Button variant="ghost" size="sm" onClick={onClearVideos}><Trash2 size={14} />Очистить</Button>}
            </div>

            {!videos.length ? (
              <button onClick={onPickFiles} className="group flex min-h-52 w-full flex-col items-center justify-center rounded-xl border border-dashed border-primary/35 bg-primary/[0.035] text-center transition-colors hover:border-primary/65 hover:bg-primary/[0.065]">
                <div className="flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-transform group-hover:-translate-y-0.5"><UploadCloud size={21} /></div>
                <p className="mt-4 font-medium">Выберите видео для загрузки</p>
                <p className="mt-1 text-xs text-muted-foreground">Можно добавить сразу несколько файлов</p>
              </button>
            ) : (
              <div className="space-y-2">
                {videos.map((video, index) => {
                  const expanded = expandedVideo === video.id;
                  return (
                    <div key={video.id} className="overflow-hidden rounded-xl border border-border bg-background/30">
                      <div className="flex items-center gap-3 p-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300"><FileVideo2 size={17} /></div>
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{fileName(video.filePath)}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Видео {index + 1} · готово к настройке</p></div>
                        <Button variant="ghost" size="icon" onClick={() => setExpandedVideo(expanded ? null : video.id)} aria-label="Метаданные видео"><ChevronDown size={16} className={cn("transition-transform", expanded && "rotate-180")} /></Button>
                        <Button variant="ghost" size="icon" onClick={() => onRemoveVideo(video.id)} aria-label="Удалить видео"><Trash2 size={15} /></Button>
                      </div>
                      {expanded && (
                        <div className="grid gap-3 border-t border-border/60 bg-card/35 p-4">
                          <label className="grid gap-1.5 text-xs font-medium">Название<Input value={video.title} onChange={(event) => onUpdateVideo(video.id, { title: event.target.value })} placeholder={defaultTitle || titleFromPath(video.filePath)} /></label>
                          <label className="grid gap-1.5 text-xs font-medium">Описание<Textarea rows={3} value={video.description} onChange={(event) => onUpdateVideo(video.id, { description: event.target.value })} placeholder="Используется общее описание" /></label>
                          <label className="grid gap-1.5 text-xs font-medium">Приватность YouTube
                            <select className="h-9 rounded-lg border border-input bg-background/60 px-3 outline-none focus:border-primary/60" value={video.privacyStatus} onChange={(event) => onUpdateVideo(video.id, { privacyStatus: event.target.value as PrivacyStatus | "" })}>
                              <option value="">Общая настройка ({defaultPrivacy})</option><option value="private">Приватное</option><option value="unlisted">По ссылке</option><option value="public">Публичное</option>
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button variant="secondary" className="mt-2 w-full" onClick={onPickFiles}><Plus size={15} />Добавить ещё видео</Button>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4"><h2 className="font-semibold">Общие метаданные</h2><p className="mt-1 text-xs text-muted-foreground">Применяются, если у видео не указаны индивидуальные значения.</p></div>
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-xs font-medium">Название по умолчанию<Input value={defaultTitle} onChange={(event) => onDefaultTitle(event.target.value)} placeholder="Если пусто — имя файла" /></label>
              <label className="grid gap-1.5 text-xs font-medium">Общее описание<Textarea rows={3} value={defaultDescription} onChange={(event) => onDefaultDescription(event.target.value)} placeholder="Описание или подпись публикации" /></label>
              <label className="grid gap-1.5 text-xs font-medium">Приватность YouTube
                <select className="h-9 rounded-lg border border-input bg-background/60 px-3 outline-none focus:border-primary/60" value={defaultPrivacy} onChange={(event) => onDefaultPrivacy(event.target.value as PrivacyStatus)}>
                  <option value="private">Приватное</option><option value="unlisted">По ссылке</option><option value="public">Публичное</option>
                </select>
              </label>
              <div className="flex gap-2 rounded-lg border border-blue-400/15 bg-blue-400/[0.06] p-3 text-[11px] leading-5 text-blue-100/75"><Info size={15} className="mt-0.5 shrink-0 text-blue-300" />Для TikTok и Instagram название и описание будут использованы как подпись. Приватность применяется только к YouTube.</div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarClock size={17} className="text-primary" />
              <div>
                <h2 className="font-semibold">Время публикации</h2>
                <p className="mt-1 text-xs text-muted-foreground">Единое время старта для всей партии.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onScheduleMode("now")}
                className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition-colors", scheduleMode === "now" ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-background/25 hover:bg-accent/50")}
              >
                <Zap size={16} className="text-primary" />
                <span><span className="block text-sm font-medium">Сейчас</span><span className="text-[11px] text-muted-foreground">Добавить в очередь сразу</span></span>
              </button>
              <button
                type="button"
                onClick={() => onScheduleMode("scheduled")}
                className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition-colors", scheduleMode === "scheduled" ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-background/25 hover:bg-accent/50")}
              >
                <CalendarClock size={16} className="text-primary" />
                <span><span className="block text-sm font-medium">По времени</span><span className="text-[11px] text-muted-foreground">Запустить в выбранный момент</span></span>
              </button>
            </div>
            {scheduleMode === "scheduled" && (
              <label className="mt-4 grid gap-1.5 text-xs font-medium">
                Дата и время по часовому поясу Windows
                <Input
                  type="datetime-local"
                  value={scheduledAtLocal}
                  onChange={(event) => onScheduledAtLocal(event.target.value)}
                />
              </label>
            )}
          </Card>
        </div>

        <Card className="sticky top-0 p-5">
          <div className="flex items-center gap-2"><Users size={17} className="text-primary" /><h2 className="font-semibold">Целевые аккаунты</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Выберите, куда отправить каждое видео.</p>
          <div className="mt-4 space-y-2">
            {accounts.map((account) => {
              const selected = selectedAccountIds.includes(account.id);
              return (
                <label key={account.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors", selected ? "border-primary/40 bg-primary/[0.07]" : "border-border bg-background/25 hover:bg-accent/50")}>
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selected} onChange={(event) => onToggleAccount(account.id, event.target.checked)} />
                  <PlatformBadge platform={account.platform} compact />
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{account.label}</p><p className="text-[10px] capitalize text-muted-foreground">{account.platform}</p></div>
                </label>
              );
            })}
          </div>
          {!accounts.length && <EmptyState title="Нет аккаунтов" description="Сначала подключите хотя бы одну площадку." action={<Button size="sm" variant="secondary" onClick={onGoAccounts}>Подключить аккаунт</Button>} />}
          {accounts.length > 0 && <p className="mt-3 text-[11px] text-muted-foreground">Выбрано: {selectedAccountIds.length} из {accounts.length}</p>}
        </Card>
      </div>

      <div className="fixed bottom-0 left-[216px] right-0 z-20 border-t border-border/70 bg-background/90 px-7 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1420px] items-center justify-between">
          <div><p className="text-sm font-medium">{videos.length} видео × {selectedAccountIds.length} аккаунтов = {jobCount} заданий</p><p className="mt-0.5 text-[11px] text-muted-foreground">{ready ? (scheduleMode === "scheduled" ? `Запланировано: ${new Date(scheduledAtLocal).toLocaleString("ru-RU")}` : "Всё готово к запуску") : "Добавьте видео и выберите аккаунты"}</p></div>
          <Button disabled={!ready || creatingBatch} onClick={onStart}>{creatingBatch ? <><span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />{uploadProgress ? `Видео ${uploadProgress.fileIndex + 1}/${uploadProgress.fileCount}: ${uploadProgress.percent}%` : "Создаём очередь…"}</> : <><Send size={15} />Запустить публикацию</>}</Button>
        </div>
      </div>
    </div>
  );
}
