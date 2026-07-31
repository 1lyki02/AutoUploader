import { BarChart3, Radio, Send, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { LicenseClientState, UploadJobSummary } from "@/env.d.ts";
import { HeaderActions } from "@/components/header-actions";
import { RoadMark } from "@/components/road-mark";
import type { AppPreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export type ViewId = "dashboard" | "publish" | "queue" | "accounts";

const navItems: Array<{ id: ViewId; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Обзор", icon: BarChart3 },
  { id: "publish", label: "Публикация", icon: Send },
  { id: "queue", label: "Очередь", icon: Radio },
  { id: "accounts", label: "Аккаунты", icon: Users },
];

export function AppShell({
  activeView,
  onNavigate,
  runningCount,
  accountCount,
  license,
  jobs,
  preferences,
  onPreferencesChange,
  onRefreshLicense,
  onOpenActivation,
  licenseBusy,
  children,
}: {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  runningCount: number;
  accountCount: number;
  license: LicenseClientState;
  jobs: UploadJobSummary[];
  preferences: AppPreferences;
  onPreferencesChange: (patch: Partial<AppPreferences>) => void;
  onRefreshLicense: () => void;
  onOpenActivation: () => void;
  licenseBusy: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid h-full grid-cols-[216px_minmax(0,1fr)]">
      <aside className="flex h-full flex-col border-r border-border/70 bg-card/55 px-3 py-4 backdrop-blur-xl">
        <div className="flex h-11 items-center gap-3 px-2">
          <div className="relative">
            <RoadMark size={36} className="shadow-[0_0_26px_-7px_var(--primary)]" />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-emerald-400" />
          </div>
          <p className="font-semibold tracking-tight">ROAD</p>
        </div>

        <nav className="mt-7 space-y-1" aria-label="Основная навигация">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Рабочее пространство</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors",
                  activeView === item.id ? "bg-primary/13 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-current={activeView === item.id ? "page" : undefined}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.id === "queue" && runningCount > 0 && <span className="ml-auto rounded-full bg-blue-400/15 px-1.5 py-0.5 text-[10px] text-blue-200">{runningCount}</span>}
                {item.id === "accounts" && accountCount > 0 && <span className="ml-auto text-xs text-muted-foreground">{accountCount}</span>}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-border/70 bg-background/35 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Система готова
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            {license.bypass
              ? "Лицензия: development bypass"
              : `Тариф ${license.plan ?? "—"} · до ${license.expiresAt ? new Date(license.expiresAt).toLocaleDateString("ru-RU") : "—"}`}
          </p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-end border-b border-border/60 bg-background/45 px-7 backdrop-blur-xl">
          <HeaderActions
            license={license}
            jobs={jobs}
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
            onRefreshLicense={onRefreshLicense}
            onOpenActivation={onOpenActivation}
            licenseBusy={licenseBusy}
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1420px] p-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
