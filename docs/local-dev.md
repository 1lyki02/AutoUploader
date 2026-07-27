# Локальный запуск AutoUploader (desktop)

Загрузки YouTube / TikTok / Instagram идут **внутри Electron**. `pnpm dev:server` для этого не нужен (там только `/health`).

## 1. Зависимости

```bash
pnpm install
```

Нужны Node ≥ 22 и pnpm. Для TikTok/Instagram browser automation один раз:

```bash
pnpm --filter @autouploader/automation install-browsers
```

## 2. Env

```bash
copy apps\client\.env.example apps\client\.env
```

Заполни в `apps/client/.env`:

- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` — см. [youtube-api-setup.md](./youtube-api-setup.md)
- опционально `INSTAGRAM_PROXY_*` — прокси по умолчанию при подключении Instagram

Instagram **не** использует логин/пароль из `.env`: вход вручную в открывшемся браузере (как TikTok).

## 3. Запуск

```bash
pnpm dev:client
```

## Instagram (браузер, как рабочий Selenium-скрипт)

1. «Подключить Instagram Reels» → откроется Chrome/Chromium.
2. Войди вручную (пароль, 2FA, checkpoint — всё в браузере).
3. После появления `sessionid` сессия сохранится.
4. «Загрузить видео» → UI-автоматизация Reels: Создать → файл → Далее ×2 → описание → Поделиться.

Старые аккаунты, сохранённые через instagrapi (логин/пароль), нужно удалить и подключить заново.
