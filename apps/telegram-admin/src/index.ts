import { loadConfig } from "./config.js";
import { createBot } from "./bot.js";
import { startHttpServer } from "./server.js";

const config = loadConfig();

startHttpServer(config);

const bot = createBot(config);

console.log(
  `[telegram-admin] starting · admins: ${[...config.adminIds].join(", ")}`,
);

await bot.api.setMyCommands([
  { command: "app", description: "Открыть Mini App админку" },
  { command: "help", description: "Список команд" },
  { command: "licenses", description: "Список / поиск лицензий" },
  { command: "show", description: "Детали лицензии" },
  { command: "new", description: "Создать ключ" },
  { command: "extend", description: "Продлить лицензию" },
  { command: "revoke", description: "Отозвать лицензию" },
  { command: "restore", description: "Восстановить лицензию" },
  { command: "reset", description: "Сбросить устройство" },
  { command: "events", description: "Лог событий" },
  { command: "cancel", description: "Отменить мастер /new" },
]);

if (config.webAppUrl) {
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: "Админка",
        web_app: { url: config.webAppUrl },
      },
    });
    console.log("[telegram-admin] Menu Button → Mini App");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[telegram-admin] не удалось поставить Menu Button: ${message}`);
  }
} else {
  try {
    await bot.api.setChatMenuButton({
      menu_button: { type: "commands" },
    });
  } catch {
    // ignore
  }
}

await bot.start({
  onStart: (info) => {
    console.log(`[telegram-admin] @${info.username} is running`);
  },
});
