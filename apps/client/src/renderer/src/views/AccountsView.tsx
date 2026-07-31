import { Check, Globe2, MoreHorizontal, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AccountSummary, ProxyConfig } from "@/env.d.ts";
import { PlatformBadge, SectionHeader } from "@/components/shared";
import { InstagramIcon, TikTokIcon, YouTubeIcon } from "@/components/platform-icons";
import { Button, Card, ConfirmDialog, Dialog, EmptyState, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

type ConnectPlatform = "youtube" | "tiktok" | "instagram";

export function AccountsView({
  accounts,
  selectedAccountIds,
  connecting,
  onConnect,
  onToggle,
  onToggleAll,
  onSaveProxy,
  onDelete,
}: {
  accounts: AccountSummary[];
  selectedAccountIds: string[];
  connecting: ConnectPlatform | null;
  onConnect: (platform: ConnectPlatform) => void;
  onToggle: (id: string, selected: boolean) => void;
  onToggleAll: () => void;
  onSaveProxy: (id: string, proxy: ProxyConfig | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [proxyAccount, setProxyAccount] = useState<AccountSummary | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<AccountSummary | null>(null);
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setServer(proxyAccount?.proxy?.server ?? "");
    setUsername(proxyAccount?.proxy?.username ?? "");
    setPassword(proxyAccount?.proxy?.password ?? "");
  }, [proxyAccount]);

  const saveProxy = async () => {
    if (!proxyAccount) return;
    setSaving(true);
    try {
      await onSaveProxy(proxyAccount.id, server.trim() ? { server: server.trim(), username: username || undefined, password: password || undefined } : null);
      setProxyAccount(null);
    } catch {
      // The parent reports the IPC error in a toast; keep the dialog open for correction.
    } finally {
      setSaving(false);
    }
  };

  const connectOptions: Array<{
    id: ConnectPlatform;
    label: string;
    detail: string;
    icon: (props: { size?: number }) => ReactNode;
    className: string;
  }> = [
    { id: "youtube", label: "YouTube", detail: "OAuth подключение", icon: YouTubeIcon, className: "text-red-300 bg-red-400/10" },
    { id: "tiktok", label: "TikTok", detail: "Вход через браузер", icon: TikTokIcon, className: "text-cyan-200 bg-cyan-400/10" },
    { id: "instagram", label: "Instagram", detail: "Reels через Camoufox", icon: InstagramIcon, className: "text-fuchsia-200 bg-fuchsia-400/10" },
  ];

  return (
    <div className="view-enter">
      <SectionHeader
        eyebrow="Интеграции"
        title="Аккаунты"
        description="Подключайте площадки, выбирайте получателей публикации и настраивайте прокси."
        action={accounts.length ? <Button variant="secondary" onClick={onToggleAll}>{selectedAccountIds.length === accounts.length ? "Снять выбор" : "Выбрать все"}</Button> : undefined}
      />

      <Card className="mb-4 p-5">
        <div className="mb-4"><h2 className="font-semibold">Подключить площадку</h2><p className="mt-1 text-xs text-muted-foreground">Авторизация откроется в защищённом окне браузера.</p></div>
        <div className="grid grid-cols-3 gap-3">
          {connectOptions.map(({ id, label, detail, icon: Icon, className }) => (
            <button key={id} disabled={connecting !== null} onClick={() => onConnect(id)} className="flex items-center gap-3 rounded-xl border border-border bg-background/25 p-3.5 text-left transition-colors hover:border-primary/30 hover:bg-accent/50 disabled:opacity-45">
              <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", className)}>{connecting === id ? <span className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" /> : <Icon size={18} />}</div>
              <div><p className="text-sm font-medium">{connecting === id ? "Подключение…" : label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p></div>
              <Plus size={15} className="ml-auto text-muted-foreground" />
            </button>
          ))}
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Подключённые аккаунты</h2><p className="mt-1 text-xs text-muted-foreground">Выбрано для следующей публикации: {selectedAccountIds.length}</p></div></div>
      {accounts.length ? (
        <div className="grid grid-cols-3 gap-3">
          {accounts.map((account) => {
            const selected = selectedAccountIds.includes(account.id);
            return (
              <Card key={account.id} className={cn("relative p-4 transition-colors", selected && "border-primary/45")}>
                <div className="flex items-start justify-between">
                  <PlatformBadge platform={account.platform} compact />
                  <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Действия для ${account.label}`} onClick={() => setProxyAccount(account)}><MoreHorizontal size={16} /></button>
                </div>
                <p className="mt-4 truncate font-medium">{account.label}</p>
                <p className="mt-1 text-[11px] capitalize text-muted-foreground">{account.platform} · подключён</p>
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{account.proxy ? <><Globe2 size={13} className="text-emerald-300" />Прокси настроен</> : <><ShieldCheck size={13} />Прямое подключение</>}</div>
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{selected ? "Выбран" : "Не выбран"}</span>
                    <input type="checkbox" className="peer sr-only" checked={selected} onChange={(event) => onToggle(account.id, event.target.checked)} />
                    <span className="flex size-5 items-center justify-center rounded-md border border-input bg-background peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">{selected && <Check size={13} />}</span>
                  </label>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Аккаунтов пока нет" description="Подключите YouTube, TikTok или Instagram, чтобы начать массовую публикацию." />
      )}

      <Dialog open={!!proxyAccount} onOpenChange={(open) => !open && setProxyAccount(null)} title={`Настройки — ${proxyAccount?.label ?? ""}`} description="Прокси применяется только к этому аккаунту. Оставьте сервер пустым, чтобы отключить его.">
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-xs font-medium">Сервер прокси<Input value={server} onChange={(event) => setServer(event.target.value)} placeholder="http://host:port" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-medium">Логин<Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Необязательно" /></label>
            <label className="grid gap-1.5 text-xs font-medium">Пароль<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Необязательно" /></label>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Button variant="destructive" onClick={() => { setDeleteAccount(proxyAccount); setProxyAccount(null); }}><Trash2 size={14} />Удалить аккаунт</Button>
            <Button onClick={() => void saveProxy()} disabled={saving}>{saving ? "Сохраняем…" : "Сохранить прокси"}</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog open={!!deleteAccount} onOpenChange={(open) => !open && setDeleteAccount(null)} title="Удалить аккаунт?" description={`${deleteAccount?.label ?? "Аккаунт"} будет удалён вместе с сохранённой сессией. Это действие нельзя отменить.`} onConfirm={() => { if (deleteAccount) void onDelete(deleteAccount.id); setDeleteAccount(null); }} />
    </div>
  );
}
