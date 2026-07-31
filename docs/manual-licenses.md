# Ручные лицензии AutoUploader — подробная инструкция

Эта система нужна, чтобы после оплаты ты мог выдать покупателю одноразовый ключ.
Ключ активируется только на одном компьютере. Видео, аккаунты YouTube/TikTok/Instagram
и пароли **не отправляются** в Supabase — туда уходит только проверка лицензии.

На старте деньги принимать можно вручную (перевод, карта, как удобно). Автооплату
подключим позже. Сейчас достаточно:

1. Получил оплату.
2. Создал ключ в админке.
3. Отправил ключ покупателю.
4. Покупатель ввёл ключ в AutoUploader.

---

## Как это работает простыми словами

```text
Ты (админка)  →  создаёшь ключ  →  Supabase сохраняет хеш ключа
Покупатель    →  вводит ключ    →  Supabase привязывает ключ к его ПК
Приложение    →  получает подписанный токен и работает
```

Важные правила:

- Полный ключ показывается **только один раз** при создании. В базе хранится только
  хеш (как отпечаток), поэтому повторно «посмотреть ключ» нельзя.
- Первый ввод ключа привязывает его к ID установки этого ПК.
- Если друг попробует ввести тот же ключ на другом ПК — получит отказ
  `already_activated`.
- Если покупатель сменил компьютер — ты нажимаешь «Сбросить устройство», и ключ
  можно активировать заново на новом ПК.
- Без интернета приложение может работать до 3 дней по сохранённому токену,
  но не дольше оплаченного срока.

---

## Что понадобится

| Что | Зачем | Цена |
| --- | --- | --- |
| Аккаунт [Supabase](https://supabase.com) | База ключей и серверные функции | Бесплатный тариф обычно хватает |
| Этот репозиторий AutoUploader | Клиент + админка + код функций | Уже есть |
| Node.js 22+ и pnpm | Запуск команд | Бесплатно |
| Supabase CLI | Применить миграции и задеплоить функции | Бесплатно через `pnpm dlx` |

Устанавливать отдельный VPS для лицензий **не нужно**.

---

## Шаг 1. Создай проект в Supabase

1. Открой https://supabase.com и зарегистрируйся.
2. Нажми **New project**.
3. Заполни:
   - **Name** — например `autouploader-licenses`
   - **Database Password** — сильный пароль, сохрани его в надёжное место
   - **Region** — ближайший к тебе (например Frankfurt / Singapore)
4. Дождись, пока проект создастся (обычно 1–2 минуты).

После создания найди **Project Ref**:

1. Открой проект.
2. Слева: **Project Settings** → **General**.
3. Скопируй **Reference ID** — это и есть `PROJECT_REF`.

Он будет в адресах вида:

```text
https://PROJECT_REF.supabase.co/functions/v1/license
https://PROJECT_REF.supabase.co/functions/v1/license-admin
```

Также понадобится **Service Role Key** позже (если CLI не подставит сам):

1. **Project Settings** → **API**
2. Скопируй:
   - `Project URL`
   - `anon` public key (для справки)
   - `service_role` — **секрет**, никому не отдавай и не коммить в Git

---

## Шаг 2. Привяжи репозиторий к проекту

Открой терминал в корне проекта `AutoUploader` и выполни:

```sh
pnpm dlx supabase login
```

Откроется браузер — войди в аккаунт Supabase.

Затем привяжи проект:

```sh
pnpm dlx supabase link --project-ref ВАШ_PROJECT_REF
```

Вставь свой Reference ID вместо `ВАШ_PROJECT_REF`.

Примени таблицы и SQL-функции:

```sh
pnpm dlx supabase db push
```

Что это делает:

- создаёт таблицы `licenses` и `license_events`;
- создаёт функцию одноразовой активации;
- создаёт функции продления / отзыва / сброса устройства;
- закрывает прямой публичный доступ к таблицам (RLS).

Если команда прошла без ошибок — база готова.

---

## Шаг 3. Сгенерируй секреты

В корне проекта:

```sh
pnpm license:keys
```

Команда выведет три значения. Сохрани их сразу в текстовый файл **вне Git**
(например в менеджере паролей или на флешке).

### Что есть что

| Переменная | Куда класть | Можно ли отдавать клиентам |
| --- | --- | --- |
| `LICENSE_ADMIN_TOKEN` | Supabase Secrets + `apps/admin/.env` | **Нет**. Это пароль админки |
| `LICENSE_SIGNING_PRIVATE_JWK` | Только Supabase Secrets | **Нет**. Им подписываются токены |
| `LICENSE_SIGNING_PUBLIC_JWK` | `apps/client/.env` и `license.config.json` | Да. Это публичный ключ проверки |

Если потеряешь `LICENSE_SIGNING_PRIVATE_JWK`, нельзя будет нормально выдавать
новые подписанные токены. Поэтому сделай офлайн-копию.

Пример вывода (цифры вымышленные):

```text
LICENSE_ADMIN_TOKEN=
a1b2c3...длинная_строка...

LICENSE_SIGNING_PRIVATE_JWK=
{"kty":"OKP","crv":"Ed25519","d":"...","x":"..."}

LICENSE_SIGNING_PUBLIC_JWK=
{"kty":"OKP","crv":"Ed25519","x":"..."}
```

---

## Шаг 4. Запиши секреты в Supabase и задеплой функции

Подставь свои реальные значения:

```sh
pnpm dlx supabase secrets set LICENSE_ADMIN_TOKEN="твой_admin_token" LICENSE_SIGNING_PRIVATE_JWK='{"kty":"OKP",...}'
```

Важно:

- `LICENSE_ADMIN_TOKEN` обычно в двойных кавычках.
- `LICENSE_SIGNING_PRIVATE_JWK` — JSON, лучше в одинарных кавычках целиком.
- В Windows PowerShell иногда удобнее сначала сохранить JSON в файл и уже оттуда
  копировать без переносов строк.

Затем задеплой две функции:

```sh
pnpm dlx supabase functions deploy license
pnpm dlx supabase functions deploy license-admin
```

После деплоя адреса будут такими:

```text
https://PROJECT_REF.supabase.co/functions/v1/license
https://PROJECT_REF.supabase.co/functions/v1/license-admin
```

Проверка, что публичная функция отвечает (ожидается ошибка валидации, не 404):

```sh
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/license" ^
  -H "Content-Type: application/json" ^
  -d "{\"licenseKey\":\"AU-TEST\",\"machineId\":\"test\"}"
```

Если видишь JSON-ответ (даже с ошибкой `Invalid activation request`) — функция
доступна. Если `404` — деплой не прошёл или неверный `PROJECT_REF`.

---

## Шаг 5. Настрой клиент AutoUploader

### Для разработки (на твоём ПК)

1. Скопируй файл:

```sh
copy apps\client\.env.example apps\client\.env
```

2. Открой `apps/client/.env` и заполни минимум:

```dotenv
SUPABASE_LICENSE_URL=https://PROJECT_REF.supabase.co/functions/v1/license
LICENSE_SIGNING_PUBLIC_JWK={"kty":"OKP","crv":"Ed25519","x":"..."}
```

`LICENSE_SIGNING_PUBLIC_JWK` вставь **одной строкой**, без переносов.

3. Перезапусти клиент:

```sh
pnpm dev:client
```

### Что будет без настроек

- В **dev**-режиме без URL/ключа приложение включит `development bypass`
  (можно разрабатывать без лицензии).
- В **production**-сборке без конфига публикация будет заблокирована.

### Для релизного установщика покупателям

Заполни `apps/client/license.config.json`:

```json
{
  "apiUrl": "https://PROJECT_REF.supabase.co/functions/v1/license",
  "publicJwk": {
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "вставь_значение_x_из_публичного_jwk"
  }
}
```

Этот файл попадает в installer как ресурс. В нём только публичные данные.
Приватный JWK и admin token туда **не клади**.

Потом обычная сборка клиента:

```sh
pnpm --filter @autouploader/client package
```

---

## Шаг 6. Настрой и запусти админку

Админка — отдельное приложение только для тебя. Покупателям его не отдавай.

1. Скопируй env:

```sh
copy apps\admin\.env.example apps\admin\.env
```

2. Заполни `apps/admin/.env`:

```dotenv
SUPABASE_LICENSE_ADMIN_URL=https://PROJECT_REF.supabase.co/functions/v1/license-admin
LICENSE_ADMIN_TOKEN=тот_же_токен_что_в_supabase_secrets
```

3. Запусти:

```sh
pnpm dev:admin
```

Откроется окно **AutoUploader License Admin**.

### Сборка отдельного exe только для себя

```sh
pnpm package:admin
```

После сборки положи рядом с `.exe` файл `.env` с теми же двумя переменными.
Без него packaged-админка не сможет ходить в Supabase.

### Telegram Mini App / бот вместо (или вместе с) Electron-админкой

Тот же API лицензий доступен из `apps/telegram-admin`: **Mini App (Web App)** с полным UI
и команды бота. `LICENSE_ADMIN_TOKEN` остаётся только на сервере — браузер шлёт
Telegram `initData`, сервер проверяет HMAC и список `TELEGRAM_ADMIN_IDS`.

**Важно:** временный `*.trycloudflare.com` туннель с твоего ПК — только для разработки.
Как только ПК/туннель выключатся, Telegram покажет `ERR_CONNECTION_CLOSED`.
Для постоянной работы задеплой сервис (см. «Прод: всегда онлайн» ниже).

#### Локальная разработка

1. Создай бота у [@BotFather](https://t.me/BotFather) → получи `TELEGRAM_BOT_TOKEN`.
2. Узнай свой Telegram user id (например через [@userinfobot](https://t.me/userinfobot)).
3. Скопируй env:

```sh
copy apps\telegram-admin\.env.example apps\telegram-admin\.env
```

4. Заполни `apps/telegram-admin/.env`:

```dotenv
TELEGRAM_BOT_TOKEN=токен_от_BotFather
TELEGRAM_ADMIN_IDS=твой_telegram_user_id
SUPABASE_LICENSE_ADMIN_URL=https://PROJECT_REF.supabase.co/functions/v1/license-admin
LICENSE_ADMIN_TOKEN=тот_же_токен_что_в_supabase_secrets
# После туннеля (см. ниже):
# TELEGRAM_WEBAPP_URL=https://xxxx.trycloudflare.com
```

Несколько админов: `TELEGRAM_ADMIN_IDS=111,222`.

5. Запусти (бот + API `:8787` + Vite Mini App `:5180`):

```sh
pnpm dev:telegram-admin
```

6. **HTTPS для Mini App (только dev).** Telegram открывает Web App только по HTTPS.
   Подними туннель на Vite-порт `5180`:

```sh
cloudflared tunnel --url http://127.0.0.1:5180
```

Скопируй выданный `https://…` в `TELEGRAM_WEBAPP_URL` и перезапусти `pnpm dev:telegram-admin`.
Бот поставит Menu Button «Админка» и кнопку «Открыть админку» в `/start`.

Без `TELEGRAM_WEBAPP_URL` (и без `PUBLIC_URL` / Railway-домена) бот и локальный API
работают; открыть UI внутри Telegram нельзя.

Команды бота: `/app` (Mini App), `/new`, `/licenses`, `/show`, `/extend`, `/revoke`,
`/restore`, `/reset`, `/events`. Полный ключ — один раз после создания.

Открывай Mini App **только** кнопкой бота / Menu «Админка», не вставляй URL в браузер.

#### Прод: всегда онлайн (Docker / Railway)

Один контейнер = бот + API + собранный Mini App. ПК и cloudflared не нужны.

**Переменные окружения на хосте:**

| Переменная | Обязательно | Описание |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | да | токен BotFather |
| `TELEGRAM_ADMIN_IDS` | да | твой Telegram user id |
| `SUPABASE_LICENSE_ADMIN_URL` | да | URL `license-admin` |
| `LICENSE_ADMIN_TOKEN` | да | тот же admin token |
| `TELEGRAM_WEBAPP_URL` | желательно | публичный `https://…` сервиса |
| `PUBLIC_URL` | нет | fallback, если `TELEGRAM_WEBAPP_URL` пуст |
| `PORT` | нет | по умолчанию `8787` (Railway задаёт сам) |

На Railway, если `TELEGRAM_WEBAPP_URL` и `PUBLIC_URL` пусты, подставится
`https://$RAILWAY_PUBLIC_DOMAIN`. После первого деплоя проверь URL в логах
(`Mini App URL: …`) и при необходимости пропиши его явно в `TELEGRAM_WEBAPP_URL`.

**Сборка образа** (из корня репозитория):

```sh
docker build -f apps/telegram-admin/Dockerfile -t autouploader-telegram-admin .
```

**Запуск локально / на VPS:**

```sh
docker run --rm -p 8787:8787 \
  -e TELEGRAM_BOT_TOKEN=... \
  -e TELEGRAM_ADMIN_IDS=... \
  -e SUPABASE_LICENSE_ADMIN_URL=... \
  -e LICENSE_ADMIN_TOKEN=... \
  -e TELEGRAM_WEBAPP_URL=https://admin.example.com \
  -e PORT=8787 \
  autouploader-telegram-admin
```

На VPS повесь HTTPS (Caddy/nginx) на контейнер и укажи этот HTTPS в `TELEGRAM_WEBAPP_URL`.

**Railway:**

1. New Project → Deploy from GitHub (этот репо) **или** `railway up` с Docker.
2. Settings → Dockerfile path: `apps/telegram-admin/Dockerfile` (корень репо).
   В корне уже лежит `railway.toml` с этим путём.
3. Variables → вставь таблицу выше. `PORT` не обязателен.
4. Deploy → дождись `/health` = ok.
5. В логах должен быть `Menu Button → Mini App` и `@ROADadmbot is running`.
6. В Telegram: `/app` → «Открыть админку».

Локальная проверка production-сборки без Docker:

```sh
pnpm build:telegram-admin
pnpm start:telegram-admin
```

Токен бота и `LICENSE_ADMIN_TOKEN` наружу не свети.

---

## Шаг 7. Как продавать и выдавать ключи каждый день

### Создать ключ после оплаты

1. Открой Electron-админку, Telegram Mini App («Открыть админку») **или** бота (`/new`).
2. Заполни:
   - **Покупатель** — имя или ник
   - **Контакт** — Telegram / email
   - **Тариф** — обычно `pro`
   - **Дней** — `30`, `90`, `365` или своё число
   - **Заметка** — опционально (сумма, способ оплаты)
3. Нажми **Создать ключ**.
4. Сразу появится полный ключ вида:

```text
AU-XXXXX-XXXXX-XXXXX-XXXXX
```

5. Нажми **Копировать** и отправь покупателю.
6. Больше этот полный ключ из базы достать нельзя — сохрани переписку/запись,
   если нужно для поддержки.

Срок начинается **с момента первой активации**, а не с даты создания ключа.

### Что делает покупатель

1. Открывает AutoUploader.
2. Видит экран активации.
3. Вставляет ключ.
4. Нажимает **Активировать**.
5. Если всё ок — попадает в основное приложение.

На экране активации есть **ID установки**. Его можно попросить у покупателя,
если нужно понять, на каком ПК ключ уже сидит.

### Продлить подписку

1. Найди лицензию в таблице (по имени / контакту / префиксу ключа).
2. Выбери её справа.
3. Нажми **Продлить**.
4. Укажи число дней (например `30`).

Правило продления:

- если лицензия ещё активна — дни добавляются к текущей дате окончания;
- если уже истекла — дни добавляются от текущего момента.

### Покупатель сменил ПК / переустановил Windows

1. Выбери лицензию.
2. Нажми **Сбросить устройство**.
3. Попроси ввести тот же ключ на новом ПК.

После сброса старый ПК перестанет проходить проверку при следующем онлайн-запросе.

### Отозвать ключ (возврат / мошенничество)

1. Выбери лицензию.
2. Нажми **Отозвать**.

Новые публикации с этого ключа станут недоступны после онлайн-проверки.
Уже запущенные локальные задания приложение специально не рвёт на полуслове.

### Восстановить ошибочно отозванный ключ

1. Выбери лицензию.
2. Нажми **Восстановить**.

---

## Что видит покупатель в приложении

| Статус | Значение |
| --- | --- |
| Активна | Можно публиковать |
| Не активирована | Нужно ввести ключ |
| Истекла | Нужно продление |
| Отозвана | Ключ заблокирован |
| Уже активирована | Ключ занят другим ПК |
| Ошибка конфигурации | В сборке не прописан сервис лицензий |

В боковой панели клиента показываются тариф и дата окончания.

Проверка с сервером идёт примерно раз в 6 часов. Если сервер временно недоступен,
приложение может работать офлайн до 3 дней (но не дольше `expiresAt`).

---

## Безопасность — обязательно

Делай так:

- `LICENSE_ADMIN_TOKEN` и `LICENSE_SIGNING_PRIVATE_JWK` храни только у себя.
- Не коммить файлы `.env` (они уже в `.gitignore`).
- Не отправляй админку покупателям.
- Не публикуй `service_role` ключ Supabase.
- Полный ключ лицензии отправляй покупателю в личку, не в общий чат.

Не делай так:

- не клади приватный JWK в клиент;
- не используй один admin token в публичных документах;
- не пытайся «сделать офлайн-ключи без сервера» — тогда один ключ смогут
  активировать сразу несколько людей.

---

## Частые проблемы

### Админка пишет Unauthorized

- Неверный `LICENSE_ADMIN_TOKEN` в `apps/admin/.env`.
- В Supabase Secrets записан другой токен.
- После смены секрета функции нужно перезадеплоить / подождать применения secrets.

### Клиент пишет «ключ уже активирован на другом компьютере»

- Ключ уже привязан.
- Решение: в админке **Сбросить устройство**, затем активировать снова.

### Клиент в dev вообще не просит ключ

- Это `development bypass`: не заполнены `SUPABASE_LICENSE_URL` /
  `LICENSE_SIGNING_PUBLIC_JWK`.
- Для проверки настоящего сценария заполни `.env` и перезапусти.

### Production-сборка не даёт публиковать

- Пустой `license.config.json`.
- Заполни `apiUrl` и `publicJwk`, пересобери installer.

### `supabase db push` или `functions deploy` падает

- Не выполнен `supabase login` / `supabase link`.
- Неверный `PROJECT_REF`.
- Нет интернета / VPN режет API Supabase.
- Повтори команду и внимательно прочитай текст ошибки.

### Потерял полный ключ сразу после создания

- Из базы его не восстановить.
- Создай новый ключ и отправь покупателю.
- Старый можно отозвать, если он ещё не активирован или уже не нужен.

---

## Чеклист первого запуска

1. Создан проект Supabase.
2. Выполнены `login`, `link`, `db push`.
3. Сгенерированы ключи через `pnpm license:keys`.
4. Секреты записаны в Supabase Secrets.
5. Задеплоены `license` и `license-admin`.
6. Заполнен `apps/admin/.env`, админка открывается.
7. Создан тестовый ключ на 1–7 дней.
8. Заполнен `apps/client/.env`.
9. Тестовый ключ активирован в клиенте.
10. Проверен отказ на втором «ПК» (другой install ID / другой профиль Windows).
11. Проверены продление, сброс устройства и отзыв.

---

## Команды быстрой проверки кода

```sh
pnpm --filter @autouploader/shared typecheck
pnpm --filter @autouploader/client test:license
pnpm --filter @autouploader/client typecheck
pnpm --filter @autouploader/admin typecheck
pnpm --filter @autouploader/admin build
```

Если установлен Deno:

```sh
deno test supabase/functions/tests
```

Если поднят локальный Supabase:

```sh
pnpm dlx supabase test db
```

---

## Куда смотреть в коде

| Путь | Что там |
| --- | --- |
| `supabase/migrations/0001_licenses.sql` | Таблицы и SQL активации |
| `supabase/functions/license` | Публичная активация для клиента |
| `supabase/functions/license-admin` | Закрытое API админки |
| `apps/admin` | Приватное Electron-приложение администратора |
| `apps/telegram-admin` | Telegram Mini App + бот (те же операции по лицензиям) |
| `apps/client/src/main/license` | Проверка лицензии в main process |
| `apps/client/src/renderer/src/views/ActivationView.tsx` | Экран ввода ключа |
| `packages/shared/src/license-contract.ts` | Общие типы и статусы |

Если что-то из шагов выше упрётся в ошибку — пришли текст ошибки целиком,
разберём точечно.
