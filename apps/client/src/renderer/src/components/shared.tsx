import { Check, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { UploadJobSummary } from "@/env.d.ts";
import { Badge } from "@/components/ui";
import { PlatformIcon } from "@/components/platform-icons";
import { cn } from "@/lib/utils";

export type Platform = "youtube" | "tiktok" | "instagram" | string;

const platformMeta: Record<string, { label: string; className: string }> = {
  youtube: { label: "YouTube", className: "bg-red-500/12 text-red-300 border-red-500/20" },
  tiktok: { label: "TikTok", className: "bg-cyan-400/10 text-cyan-200 border-cyan-400/20" },
  instagram: { label: "Instagram", className: "bg-fuchsia-400/10 text-fuchsia-200 border-fuchsia-400/20" },
};

export function PlatformBadge({ platform, compact = false }: { platform: Platform; compact?: boolean }) {
  const meta = platformMeta[platform] ?? { label: platform, className: "" };
  return (
    <Badge className={cn(meta.className, compact && "size-8 justify-center p-0")}>
      <PlatformIcon platform={platform} size={compact ? 16 : 14} />
      {!compact && meta.label}
    </Badge>
  );
}

const statusMeta: Record<UploadJobSummary["status"], { label: string; className: string; icon: ReactNode }> = {
  pending: { label: "В очереди", className: "text-zinc-300", icon: <Clock3 size={12} /> },
  running: { label: "Загружается", className: "border-blue-400/20 bg-blue-400/10 text-blue-200", icon: <LoaderCircle size={12} className="animate-spin" /> },
  done: { label: "Готово", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200", icon: <Check size={12} /> },
  failed: { label: "Ошибка", className: "border-red-400/20 bg-red-400/10 text-red-200", icon: <TriangleAlert size={12} /> },
  missed: { label: "Пропущено", className: "border-amber-400/20 bg-amber-400/10 text-amber-200", icon: <TriangleAlert size={12} /> },
  needs_review: { label: "Нужна проверка", className: "border-amber-400/20 bg-amber-400/10 text-amber-200", icon: <TriangleAlert size={12} /> },
  reauth_required: { label: "Нужен вход", className: "border-orange-400/20 bg-orange-400/10 text-orange-200", icon: <TriangleAlert size={12} /> },
};

export function StatusBadge({ status }: { status: UploadJobSummary["status"] }) {
  const meta = statusMeta[status];
  return <Badge className={meta.className}>{meta.icon}{meta.label}</Badge>;
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex min-h-14 items-start justify-between gap-5">
      <div>
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
