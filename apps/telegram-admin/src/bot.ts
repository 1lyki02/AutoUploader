import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
import type { GenerateLicenseRequest, LicenseAdminSummary } from "@autouploader/shared";
import type { AppConfig } from "./config.js";
import {
  HELP_TEXT,
  escapeHtml,
  formatEvents,
  formatLicense,
  formatLicenseList,
} from "./format.js";
import { LicenseAdminClient } from "./license-api.js";

type WizardStep = "customerName" | "customerContact" | "durationDays" | "plan" | "notes" | "confirm";

interface WizardState {
  step: WizardStep;
  draft: Partial<GenerateLicenseRequest>;
}

const wizards = new Map<number, WizardState>();

function actionKeyboard(license: LicenseAdminSummary): InlineKeyboard {
  const id = license.id;
  return new InlineKeyboard()
    .text("Продлить +30", `extend:${id}:30`)
    .text("Продлить +90", `extend:${id}:90`)
    .row()
    .text("Сброс ПК", `reset:${id}`)
    .text("События", `events:${id}`)
    .row()
    .text(license.status === "revoked" ? "Восстановить" : "Отозвать",
      license.status === "revoked" ? `restore:${id}` : `revoke:${id}`);
}

function parseArgs(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function filterLicenses(rows: LicenseAdminSummary[], query: string): LicenseAdminSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((license) =>
    `${license.customerName} ${license.customerContact ?? ""} ${license.keyPrefix} ${license.status} ${license.plan} ${license.id}`
      .toLowerCase()
      .includes(q));
}

async function replyError(ctx: Context, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await ctx.reply(`Ошибка: ${message}`);
}

function openAdminKeyboard(webAppUrl: string | undefined): Keyboard | undefined {
  if (!webAppUrl) return undefined;
  return new Keyboard()
    .webApp("Открыть админку", webAppUrl)
    .resized()
    .persistent();
}

export function createBot(config: AppConfig): Bot {
  const bot = new Bot(config.botToken);
  const api = new LicenseAdminClient(config);
  const webAppKeyboard = openAdminKeyboard(config.webAppUrl);

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !config.adminIds.has(userId)) {
      if (ctx.message || ctx.callbackQuery) {
        await ctx.reply("Доступ только для администраторов.");
      }
      return;
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(HELP_TEXT, {
      parse_mode: "HTML",
      reply_markup: webAppKeyboard,
    });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT, {
      parse_mode: "HTML",
      reply_markup: webAppKeyboard,
    });
  });

  bot.command("app", async (ctx) => {
    if (!config.webAppUrl) {
      await ctx.reply(
        "Mini App ещё не настроен. Задай TELEGRAM_WEBAPP_URL (HTTPS-туннель) в apps/telegram-admin/.env и перезапусти бота.",
      );
      return;
    }
    await ctx.reply("Открой админку кнопкой ниже:", {
      reply_markup: new InlineKeyboard().webApp("Открыть админку", config.webAppUrl),
    });
  });

  bot.command("cancel", async (ctx) => {
    const userId = ctx.from!.id;
    if (wizards.delete(userId)) {
      await ctx.reply("Мастер создания ключа отменён.");
      return;
    }
    await ctx.reply("Нечего отменять.");
  });

  bot.command("licenses", async (ctx) => {
    try {
      const query = (ctx.match ?? "").toString().trim();
      const rows = filterLicenses(await api.list(), query);
      await ctx.reply(formatLicenseList(rows), { parse_mode: "HTML" });
    } catch (error) {
      await replyError(ctx, error);
    }
  });

  bot.command("show", async (ctx) => {
    try {
      const ref = (ctx.match ?? "").toString().trim();
      if (!ref) {
        await ctx.reply("Использование: /show префикс_или_id");
        return;
      }
      const license = await api.require(ref);
      await ctx.reply(formatLicense(license), {
        parse_mode: "HTML",
        reply_markup: actionKeyboard(license),
      });
    } catch (error) {
      await replyError(ctx, error);
    }
  });

  bot.command("events", async (ctx) => {
    try {
      const ref = (ctx.match ?? "").toString().trim();
      if (!ref) {
        await ctx.reply("Использование: /events префикс_или_id");
        return;
      }
      const license = await api.require(ref);
      const events = await api.events(license.id);
      await ctx.reply(
        `<b>События</b> · <code>${escapeHtml(license.keyPrefix)}</code>\n\n${formatEvents(events)}`,
        { parse_mode: "HTML" },
      );
    } catch (error) {
      await replyError(ctx, error);
    }
  });

  bot.command("extend", async (ctx) => {
    try {
      const [ref, daysRaw] = parseArgs((ctx.match ?? "").toString());
      const days = Number(daysRaw);
      if (!ref || !Number.isInteger(days) || days < 1) {
        await ctx.reply("Использование: /extend префикс_или_id дней");
        return;
      }
      const license = await api.require(ref);
      const updated = await api.action({
        action: "extend",
        licenseId: license.id,
        days,
      });
      await ctx.reply(`Продлено на ${days} дн.\n\n${formatLicense(updated)}`, {
        parse_mode: "HTML",
        reply_markup: actionKeyboard(updated),
      });
    } catch (error) {
      await replyError(ctx, error);
    }
  });

  bot.command("revoke", async (ctx) => {
    try {
      const ref = (ctx.match ?? "").toString().trim();
      if (!ref) {
        await ctx.reply("Использование: /revoke префикс_или_id");
        return;
      }
      const license = await api.require(ref);
      const updated = await api.action({ action: "revoke", licenseId: license.id });
      await ctx.reply(`Лицензия отозвана.\n\n${formatLicense(updated)}`, {
        parse_mode: "HTML",
        reply_markup: actionKeyboard(updated),
      });
    } catch (error) {
      await replyError(ctx, error);
    }
  });

  bot.command("restore", async (ctx) => {
    try {
      const ref = (ctx.match ?? "").toString().trim();
      if (!ref) {
        await ctx.reply("Использование: /restore префикс_или_id");
        return;
      }
      const license = await api.require(ref);
      const updated = await api.action({ action: "restore", licenseId: license.id });
      await ctx.reply(`Лицензия восстановлена.\n\n${formatLicense(updated)}`, {
        parse_mode: "HTML",
        reply_markup: actionKeyboard(updated),
      });
    } catch (error) {
      await replyError(ctx, error);
    }
  });

  bot.command("reset", async (ctx) => {
    try {
      const ref = (ctx.match ?? "").toString().trim();
      if (!ref) {
        await ctx.reply("Использование: /reset префикс_или_id");
        return;
      }
      const license = await api.require(ref);
      const updated = await api.action({
        action: "reset-device",
        licenseId: license.id,
      });
      await ctx.reply(`Привязка устройства сброшена.\n\n${formatLicense(updated)}`, {
        parse_mode: "HTML",
        reply_markup: actionKeyboard(updated),
      });
    } catch (error) {
      await replyError(ctx, error);
    }
  });

  bot.command("new", async (ctx) => {
    const userId = ctx.from!.id;
    wizards.set(userId, {
      step: "customerName",
      draft: { plan: "pro", durationDays: 30 },
    });
    await ctx.reply(
      "Создание ключа.\n\n1/5 Имя покупателя:\n\n(/cancel — отмена)",
    );
  });

  bot.on("callback_query:data", async (ctx) => {
    try {
      const data = ctx.callbackQuery.data;
      const [action, licenseId, daysRaw] = data.split(":");
      if (!action || !licenseId) {
        await ctx.answerCallbackQuery({ text: "Некорректная кнопка" });
        return;
      }

      if (action === "events") {
        const events = await api.events(licenseId);
        const license = await api.require(licenseId);
        await ctx.answerCallbackQuery();
        await ctx.reply(
          `<b>События</b> · <code>${escapeHtml(license.keyPrefix)}</code>\n\n${formatEvents(events)}`,
          { parse_mode: "HTML" },
        );
        return;
      }

      if (action === "extend") {
        const days = Number(daysRaw);
        if (!Number.isInteger(days) || days < 1) {
          await ctx.answerCallbackQuery({ text: "Некорректный срок" });
          return;
        }
        const updated = await api.action({
          action: "extend",
          licenseId,
          days,
        });
        await ctx.answerCallbackQuery({ text: `+${days} дн.` });
        await ctx.editMessageText(`Продлено на ${days} дн.\n\n${formatLicense(updated)}`, {
          parse_mode: "HTML",
          reply_markup: actionKeyboard(updated),
        });
        return;
      }

      if (action === "revoke" || action === "restore" || action === "reset") {
        const mapped = action === "reset" ? "reset-device" as const : action;
        const updated = await api.action({ action: mapped, licenseId });
        const title = action === "revoke"
          ? "Лицензия отозвана."
          : action === "restore"
          ? "Лицензия восстановлена."
          : "Привязка устройства сброшена.";
        await ctx.answerCallbackQuery({ text: "Готово" });
        await ctx.editMessageText(`${title}\n\n${formatLicense(updated)}`, {
          parse_mode: "HTML",
          reply_markup: actionKeyboard(updated),
        });
        return;
      }

      if (action === "confirm_new") {
        const wizard = wizards.get(ctx.from!.id);
        if (!wizard || wizard.step !== "confirm") {
          await ctx.answerCallbackQuery({ text: "Мастер не активен" });
          return;
        }
        const draft = wizard.draft;
        if (!draft.customerName || !draft.durationDays || !draft.plan) {
          await ctx.answerCallbackQuery({ text: "Не хватает данных" });
          return;
        }
        await ctx.answerCallbackQuery({ text: "Создаю…" });
        const result = await api.generate({
          customerName: draft.customerName,
          customerContact: draft.customerContact || undefined,
          plan: draft.plan,
          durationDays: draft.durationDays,
          notes: draft.notes || undefined,
        });
        wizards.delete(ctx.from!.id);
        await ctx.editMessageText(
          [
            "<b>Ключ создан — сохрани и отправь покупателю сейчас</b>",
            `<code>${escapeHtml(result.licenseKey)}</code>`,
            "",
            formatLicense(result.license),
          ].join("\n"),
          {
            parse_mode: "HTML",
            reply_markup: actionKeyboard(result.license),
          },
        );
        return;
      }

      if (action === "cancel_new") {
        wizards.delete(ctx.from!.id);
        await ctx.answerCallbackQuery({ text: "Отменено" });
        await ctx.editMessageText("Создание ключа отменено.");
        return;
      }

      await ctx.answerCallbackQuery({ text: "Неизвестное действие" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.answerCallbackQuery({ text: "Ошибка" }).catch(() => undefined);
      await ctx.reply(`Ошибка: ${message}`);
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) {
      await next();
      return;
    }

    const userId = ctx.from!.id;
    const wizard = wizards.get(userId);
    if (!wizard) {
      await next();
      return;
    }

    const text = ctx.message.text.trim();
    try {
      switch (wizard.step) {
        case "customerName": {
          if (!text) {
            await ctx.reply("Имя не может быть пустым.");
            return;
          }
          wizard.draft.customerName = text.slice(0, 160);
          wizard.step = "customerContact";
          await ctx.reply("2/5 Контакт (Telegram/email) или «-» чтобы пропустить:");
          return;
        }
        case "customerContact": {
          wizard.draft.customerContact = text === "-" ? "" : text.slice(0, 240);
          wizard.step = "durationDays";
          await ctx.reply("3/5 Срок в днях (например 30):");
          return;
        }
        case "durationDays": {
          const days = Number(text);
          if (!Number.isInteger(days) || days < 1 || days > 3650) {
            await ctx.reply("Укажи целое число от 1 до 3650.");
            return;
          }
          wizard.draft.durationDays = days;
          wizard.step = "plan";
          await ctx.reply("4/5 План (по умолчанию pro) или «-»:");
          return;
        }
        case "plan": {
          wizard.draft.plan = text === "-" ? "pro" : text.slice(0, 80);
          wizard.step = "notes";
          await ctx.reply("5/5 Заметки или «-» чтобы пропустить:");
          return;
        }
        case "notes": {
          wizard.draft.notes = text === "-" ? "" : text.slice(0, 2000);
          wizard.step = "confirm";
          const d = wizard.draft;
          const summary = [
            "<b>Проверь данные</b>",
            `Покупатель: ${escapeHtml(d.customerName ?? "")}`,
            `Контакт: ${escapeHtml(d.customerContact || "—")}`,
            `Срок: ${d.durationDays} дн.`,
            `План: ${escapeHtml(d.plan ?? "pro")}`,
            `Заметки: ${escapeHtml(d.notes || "—")}`,
          ].join("\n");
          await ctx.reply(summary, {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard()
              .text("Создать ключ", "confirm_new")
              .text("Отмена", "cancel_new"),
          });
          return;
        }
        case "confirm": {
          await ctx.reply("Нажми кнопку «Создать ключ» или «Отмена».");
          return;
        }
      }
    } catch (error) {
      await replyError(ctx, error);
    }
  });

  bot.catch((error) => {
    console.error("[telegram-admin]", error.error);
  });

  return bot;
}
