import { ArrowRight, CheckCircle2, Clock3, Radio, Send, TriangleAlert, Users } from "lucide-react";
import type { AccountSummary, UploadJobSummary } from "@/env.d.ts";
import { Button, Card, EmptyState, Progress } from "@/components/ui";
import { PlatformBadge, SectionHeader, StatusBadge } from "@/components/shared";
import { fileName } from "@/lib/utils";
import type { ViewId } from "@/components/app-shell";

export function DashboardView({
  accounts,
  jobs,
  onNavigate,
}: {
  accounts: AccountSummary[];
  jobs: UploadJobSummary[];
  onNavigate: (view: ViewId) => void;
}) {
  const done = jobs.filter((job) => job.status === "done").length;
  const running = jobs.filter((job) => job.status === "running").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const completedPercent = jobs.length ? Math.round((done / jobs.length) * 100) : 0;

  const metrics = [
    { label: "Подключено аккаунтов", value: accounts.length, detail: "YouTube, TikTok, Instagram", icon: Users, color: "text-violet-300 bg-violet-400/10" },
    { label: "В процессе", value: running, detail: "Активные загрузки", icon: Radio, color: "text-blue-300 bg-blue-400/10" },
    { label: "Опубликовано", value: done, detail: "За всё время", icon: CheckCircle2, color: "text-emerald-300 bg-emerald-400/10" },
    { label: "Требуют внимания", value: failed, detail: "Можно повторить", icon: TriangleAlert, color: "text-red-300 bg-red-400/10" },
  ];

  return (
    <div className="view-enter">
      <SectionHeader
        eyebrow="Центр управления"
        title="Обзор"
        description="Следите за публикациями и запускайте новые загрузки из одного рабочего пространства."
        action={<Button onClick={() => onNavigate("publish")}><Send size={15} />Новая публикация</Button>}
      />

      <div className="grid grid-cols-4 gap-3">
        {metrics.map(({ label, value, detail, icon: Icon, color }) => (
          <Card key={label} className="p-4">
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p></div>
              <div className={`flex size-9 items-center justify-center rounded-lg ${color}`}><Icon size={17} /></div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{detail}</p>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1.45fr)_minmax(280px,.75fr)] gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <div><h2 className="font-semibold">Последние публикации</h2><p className="mt-0.5 text-xs text-muted-foreground">Свежие события очереди</p></div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("queue")}>Вся очередь<ArrowRight size={14} /></Button>
          </div>
          {jobs.length ? (
            <div className="divide-y divide-border/60">
              {jobs.slice(0, 6).map((job) => (
                <div key={job.id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 hover:bg-accent/35">
                  <PlatformBadge platform={job.platform} compact />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{fileName(job.filePath)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{job.accountLabel} · {job.title}</p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5"><EmptyState title="Публикаций пока нет" description="Подготовьте первое видео — прогресс появится здесь." action={<Button size="sm" variant="secondary" onClick={() => onNavigate("publish")}>Создать публикацию</Button>} /></div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Общий прогресс</h2><span className="text-lg font-semibold">{completedPercent}%</span></div>
            <Progress value={completedPercent} className="mt-4" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Всего</p><p className="mt-1 font-semibold">{jobs.length}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Готово</p><p className="mt-1 font-semibold text-emerald-300">{done}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ошибки</p><p className="mt-1 font-semibold text-red-300">{failed}</p></div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2"><Clock3 size={16} className="text-primary" /><h2 className="font-semibold">Быстрый старт</h2></div>
            <ol className="mt-4 space-y-3 text-xs text-muted-foreground">
              {["Подключите площадки", "Выберите видео и аккаунты", "Запустите очередь"].map((item, index) => (
                <li key={item} className="flex items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] text-foreground">{index + 1}</span>{item}</li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
