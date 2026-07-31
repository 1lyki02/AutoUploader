import { KeyRound, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { LicenseClientState } from "@/env.d.ts";
import { RoadMark } from "@/components/road-mark";
import { Button, Card, Input } from "@/components/ui";

const statusText: Record<LicenseClientState["status"], string> = {
  unactivated: "Введите полученный лицензионный ключ",
  active: "Лицензия активна",
  expired: "Срок лицензии закончился",
  invalid: "Ключ недействителен или сервер временно недоступен",
  revoked: "Лицензия отозвана",
  already_activated: "Этот ключ уже активирован на другом компьютере",
  configuration_error: "Сервис лицензий не настроен в этой сборке",
};

export function ActivationView({
  license,
  busy,
  onActivate,
  onRefresh,
}: {
  license: LicenseClientState;
  busy: boolean;
  onActivate: (key: string) => void;
  onRefresh: () => void;
}) {
  const [key, setKey] = useState("");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-7">
        <RoadMark size={48} />
        <h1 className="mt-5 text-xl font-semibold">Активация ROAD</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {statusText[license.status]}
        </p>
        {license.message && (
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100/80">
            {license.message}
          </p>
        )}

        <label className="mt-6 grid gap-2 text-xs font-medium">
          Лицензионный ключ
          <Input
            value={key}
            onChange={(event) => setKey(event.target.value.toUpperCase())}
            placeholder="AU-XXXXX-XXXXX-XXXXX-XXXXX"
            autoComplete="off"
          />
        </label>
        <Button
          className="mt-4 w-full"
          disabled={busy || !key.trim()}
          onClick={() => onActivate(key)}
        >
          <KeyRound size={15} />
          {busy ? "Проверяем…" : "Активировать"}
        </Button>
        <Button
          className="mt-2 w-full"
          variant="secondary"
          disabled={busy}
          onClick={onRefresh}
        >
          <RefreshCw size={14} />
          Проверить снова
        </Button>

        <p className="mt-5 break-all text-[10px] leading-4 text-muted-foreground/70">
          ID установки: {license.installId}
        </p>
      </Card>
    </main>
  );
}
