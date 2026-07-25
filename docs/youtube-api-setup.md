# Доступ к YouTube Data API v3

Каждый пользователь AutoUploader подключает **свой собственный** Google Cloud проект — это снимает общий лимит квоты (10 000 единиц/день на проект, ~6 загрузок видео) и не зависит от одного общего OAuth-клиента вендора. Ниже — шаги для одного аккаунта; при разработке (Фаза 1) сделай это один раз для тестового канала.

## 1. Создать Google Cloud проект

1. Открой https://console.cloud.google.com/
2. Вверху слева — выпадающий список проектов → **New Project**.
3. Укажи имя (например, `autouploader-dev`), нажми **Create**.
4. Дождись создания и переключись на этот проект (селектор проектов вверху).

## 2. Включить YouTube Data API v3

1. В поиске консоли введи **YouTube Data API v3** → открой карточку API.
2. Нажми **Enable**.

## 3. Настроить OAuth consent screen

1. Слева: **APIs & Services → OAuth consent screen**.
2. User Type: **External** (если это не Google Workspace-аккаунт) → Create.
3. Заполни обязательные поля: название приложения, email поддержки, email разработчика.
4. Scopes: на этом шаге можно пропустить (добавим позже) — либо сразу добавить `https://www.googleapis.com/auth/youtube.upload` и `https://www.googleapis.com/auth/youtube.readonly`.
5. Test users: пока приложение не прошло верификацию Google, добавь сюда email того Google-аккаунта (канала), с которого будешь тестировать загрузку — иначе OAuth-логин будет отклонён с ошибкой доступа.

**Важно (учесть на будущее для продакшена):** пока consent screen в статусе "Testing", refresh-токены OAuth перестают действовать через 7 дней, и залогиниться могут только явно добавленные test users. Для реальных подписчиков приложение нужно будет отправить на верификацию Google (**Publishing status → Publish App**, возможно потребует Google review из-за scope `youtube.upload` — это чувствительный scope). Это отдельная задача ближе к релизу, не блокирует разработку.

## 4. Создать OAuth-креды (Client ID/Secret)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app** (подходит для Electron-клиента, использующего loopback-редирект на `http://127.0.0.1:PORT` или ручной код).
3. Название — например `AutoUploader Desktop`.
4. После создания скачай/скопируй **Client ID** и **Client Secret** — они понадобятся клиенту для OAuth2-флоу (`google-auth-library`/`googleapis`).

## 5. Что использовать в коде (Node/`googleapis`)

- Библиотека: `googleapis` + `google-auth-library`.
- Тип флоу для desktop-приложения: **OAuth 2.0 loopback flow** — временный локальный HTTP-сервер (`http://127.0.0.1:PORT/callback`) ловит редирект с кодом авторизации после того, как пользователь залогинится в открывшемся системном браузере.
- Scopes: `https://www.googleapis.com/auth/youtube.upload` (обязателен для загрузки), `https://www.googleapis.com/auth/youtube.readonly` (для чтения статуса/метаданных канала).
- После получения `access_token`/`refresh_token` — сохранить `refresh_token` зашифрованным (Electron `safeStorage`), `access_token` обновлять через `refresh_token` перед каждой загрузкой.
- Загрузка видео: `youtube.videos.insert` с `part: 'snippet,status'`, `status.privacyStatus`, `status.publishAt` (ISO 8601) для планирования, `media.body` — поток файла (resumable upload встроен в клиентскую библиотеку автоматически при передаче потока/размера).

## 6. Квота

- 10 000 unit/день по умолчанию на проект; `videos.insert` стоит ~1600 unit → около 6 загрузок/день на один проект.
- Увеличение квоты запрашивается через **APIs & Services → Quotas** → форма запроса в Google (может занять несколько недель, требует обоснования use case) — не нужно для разработки с одним тестовым каналом, но стоит помнить при подготовке к релизу, если вендор захочет предложить пользователям "быстрый старт" без своего Cloud-проекта.

## Итог для тебя сейчас (Фаза 1, разработка)

1. Создать проект → включить YouTube Data API v3.
2. Настроить consent screen (Testing, добавить себя как test user).
3. Создать OAuth Client ID (Desktop app), сохранить Client ID/Secret.
4. Передать их в `.env`/конфиг клиента для локальной разработки (не коммитить в git).
