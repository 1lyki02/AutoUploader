import { ListFilter, RefreshCw, RotateCcw, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { UploadJobSummary } from "@/env.d.ts";
import { PlatformBadge, SectionHeader, StatusBadge } from "@/components/shared";
import { Button, Card, EmptyState, Input, Progress } from "@/components/ui";
import { cn, fileName } from "@/lib/utils";

type Filter = "all" | UploadJobSummary["status"];

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "running", label: "В процессе" },
  { id: "pending", label: "В очереди" },
  { id: "done", label: "Готово" },
  { id: "failed", label: "Ошибки" },
  { id: "cancelled", label: "Отменено" },
  { id: "needs_review", label: "Проверка" },
  { id: "reauth_required", label: "Нужен вход" },
];
const retryableStatuses = new Set<UploadJobSummary["status"]>([
  "failed",
  "missed",
  "needs_review",
  "reauth_required",
]);

const cancelableStatuses = new Set<UploadJobSummary["status"]>(["pending", "running"]);

export function QueueView({
  jobs,
  currentBatchActive,
  onShowHistory,
  onRefresh,
  onRetry,
  onCancel,
}: {
  jobs: UploadJobSummary[];
  currentBatchActive: boolean;
  onShowHistory: () => void;
  onRefresh: () => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const visible = useMemo(() => jobs.filter((job) =>
    (filter === "all" || job.status === filter) &&
    (!search || `${job.accountLabel} ${job.title} ${job.filePath}`.toLowerCase().includes(search.toLowerCase())),
  ), [filter, jobs, search]);
  const done = jobs.filter((job) => job.status === "done").length;
  const completedPercent = jobs.length ? Math.round((done / jobs.length) * 100) : 0;

  return (
    <div className="view-enter">
      <SectionHeader
        eyebrow="Мониторинг"
        title="Очередь публикаций"
        description={currentBatchActive ? "Показаны задания последнего запуска." : "Полная история загрузок и текущее состояние заданий."}
        action={<div className="flex gap-2">{currentBatchActive && <Button variant="secondary" onClick={onShowHistory}>Вся история</Button>}<Button variant="secondary" onClick={onRefresh}><RefreshCw size={14} />Обновить</Button></div>}
      />

      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground">Выполнено</p><p className="mt-1 text-xl font-semibold">{done} <span className="text-sm font-normal text-muted-foreground">из {jobs.length}</span></p></div>
          <span className="text-xl font-semibold text-primary">{completedPercent}%</span>
        </div>
        <Progress value={completedPercent} className="mt-3" />
        <div className="mt-4 flex gap-5 text-[11px] text-muted-foreground">
          <span>В очереди <strong className="ml-1 text-foreground">{jobs.filter((job) => job.status === "pending").length}</strong></span>
          <span>В процессе <strong className="ml-1 text-blue-200">{jobs.filter((job) => job.status === "running").length}</strong></span>
          <span>Ошибки <strong className="ml-1 text-red-300">{jobs.filter((job) => job.status === "failed").length}</strong></span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 p-4">
          <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-1">
            {filters.map((item) => (
              <button key={item.id} onClick={() => setFilter(item.id)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors", filter === item.id && "bg-background text-foreground shadow-sm")}>{item.label}</button>
            ))}
          </div>
          <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по очереди" aria-label="Поиск по очереди" /></div>
        </div>

        {visible.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="bg-background/30 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr><th className="px-5 py-3 font-medium">Статус</th><th className="px-3 py-3 font-medium">Платформа</th><th className="px-3 py-3 font-medium">Аккаунт</th><th className="px-3 py-3 font-medium">Видео</th><th className="px-3 py-3 font-medium">Запланировано</th><th className="px-3 py-3 font-medium">Попытки</th><th className="px-3 py-3 font-medium">Действие</th></tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {visible.map((job) => (
                  <tr key={job.id} className="hover:bg-accent/25">
                    <td className="px-5 py-3.5"><StatusBadge status={job.status} /></td>
                    <td className="px-3 py-3.5"><PlatformBadge platform={job.platform} /></td>
                    <td className="max-w-40 truncate px-3 py-3.5 font-medium">{job.accountLabel}</td>
                    <td className="max-w-60 px-3 py-3.5"><p className="truncate font-medium" title={job.filePath}>{fileName(job.filePath)}</p>{job.lastError && <p className="mt-1 truncate text-[10px] text-red-300" title={job.lastError}>{job.lastError}</p>}</td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <p className={cn(job.status === "pending" && new Date(job.scheduledAt).getTime() > Date.now() ? "text-primary" : "text-muted-foreground")}>
                        {new Date(job.scheduledAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                      {job.status === "pending" && new Date(job.scheduledAt).getTime() > Date.now() && <p className="mt-1 text-[10px] text-primary/70">ожидает времени</p>}
                    </td>
                    <td className="px-3 py-3.5 text-muted-foreground">{job.attempts}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1">
                        {cancelableStatuses.has(job.status) && (
                          <Button variant="ghost" size="sm" onClick={() => onCancel(job.id)}>
                            <XCircle size={13} />
                            Отменить
                          </Button>
                        )}
                        {retryableStatuses.has(job.status) && (
                          <Button variant="ghost" size="sm" onClick={() => onRetry(job.id)}>
                            <RotateCcw size={13} />
                            Повторить
                          </Button>
                        )}
                        {!cancelableStatuses.has(job.status) && !retryableStatuses.has(job.status) && (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState icon={<ListFilter size={17} />} title={jobs.length ? "Ничего не найдено" : "Очередь пуста"} description={jobs.length ? "Измените фильтр или поисковый запрос." : "Новые публикации появятся здесь после запуска."} /></div>
        )}
      </Card>
    </div>
  );
}
