# Локальный запуск AutoUploader (desktop)

Загрузки YouTube / TikTok / Instagram идут **внутри Electron**. `pnpm dev:server` для этого не нужен (там только `/health`).

## 1. Зависимости

```bash
pnpm install
pnpm --filter @autouploader/automation install-browsers
```

Нужны Node ≥ 22 и pnpm. `install-browsers` ставит Chromium (TikTok) и **Camoufox** (антидетект Firefox для Instagram, ~500 MB).

Если `camoufox-js fetch` упадёт на GeoIP/MaxMind — это не критично: сам браузер уже скачан, Instagram работает без GeoIP.

## 2. Env

```bash
copy apps\client\.env.example apps\client\.env
```

Заполни:

- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`
- опционально `INSTAGRAM_PROXY_*`

## 3. Запуск

```bash
pnpm dev:client
```

## Instagram (Camoufox anti-detect)

1. «Подключить Instagram Reels» → откроется **Camoufox** на `instagram.com`.
2. Войди вручную.
3. После `sessionid` сессия сохранится.
4. «Загрузить видео» — UI-автоматизация Reels в том же Camoufox.

Старые аккаунты (instagrapi / обычный Chromium) удали и подключи заново.
