import { useEffect } from "react";
import { toast } from "sonner";
import type { UpdateStatus } from "@/env.d.ts";

let manualCheckPending = false;

export function checkForAppUpdates(): void {
  manualCheckPending = true;
  void window.api.updater.check();
}

export function useAppUpdater(): void {
  useEffect(() => {
    return window.api.updater.onStatus((status: UpdateStatus) => {
      const manual = manualCheckPending;

      switch (status.type) {
        case "checking":
          if (manual) {
            toast.loading("Проверяем обновления…", { id: "app-update" });
          }
          break;
        case "available":
          toast.dismiss("app-update");
          toast.info(`Доступно обновление ${status.version}`, {
            description: "Скачивание начнётся автоматически.",
          });
          manualCheckPending = false;
          break;
        case "not-available":
          toast.dismiss("app-update");
          if (manual) {
            toast.success("У вас установлена последняя версия");
          }
          manualCheckPending = false;
          break;
        case "progress":
          if (manual || status.percent >= 5) {
            toast.loading(`Загрузка обновления… ${Math.round(status.percent)}%`, {
              id: "app-update-download",
            });
          }
          break;
        case "downloaded":
          toast.dismiss("app-update");
          toast.dismiss("app-update-download");
          toast.success(`Обновление ${status.version} готово`, {
            description: "Перезапустите приложение, чтобы применить изменения.",
            duration: Infinity,
            action: {
              label: "Перезапустить",
              onClick: () => {
                void window.api.updater.install();
              },
            },
          });
          manualCheckPending = false;
          break;
        case "error":
          toast.dismiss("app-update");
          toast.dismiss("app-update-download");
          if (manual) {
            toast.error("Не удалось проверить обновления", {
              description: status.message,
            });
          }
          manualCheckPending = false;
          break;
      }
    });
  }, []);
}
