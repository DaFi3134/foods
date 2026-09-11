# healthy food — готовый patch v3

Этот пакет приводит текущий репозиторий к одной понятной архитектуре и добавляет безопасный AI-помощник.

## Архитектура после patch

```text
GitHub Pages / docs
        |
        +--> локальные JSON (продукты, рецепты, статьи)
        |
        +--> Supabase Auth + approved_submissions
        |
        +--> Edge Function submit-content --> submissions
        |
        +--> Edge Function ai-assistant --> OpenAI Responses API
```

- `docs/` — основной фронтенд и источник истины для GitHub Pages;
- Supabase — Auth, заявки, права администратора и серверный rate limit;
- `submit-content` — валидирует и ограничивает публичные заявки;
- `ai-assistant` — держит OpenAI key на сервере и проверяет AI-ответ;
- `app.py` — только локальный preview-сервер для `docs/`;
- обычный планировщик работает без AI и без платного API.

---

## 1. Что исправлено

### Архитектура и безопасность

1. Убрана дублирующая Flask/SQLite-бизнес-логика из корневого `app.py`. Теперь Flask используется только для локального просмотра `docs/`.
2. Убрана проверка владельца по `adminEmail`, записанному в открытом JavaScript.
3. Права владельца теперь хранятся в `public.site_admins` по UUID пользователя Supabase Auth и проверяются RPC `is_site_admin()`.
4. Браузер больше не имеет прямого `INSERT` в `public.submissions`.
5. Новые заявки идут через `submit-content`, где проверяются тип, размеры полей, origin и rate limit.
6. Публичный сайт читает одобренные материалы через `approved_submissions`, где нет `author_email`, `author_contact` и `moderator_note`; контакт/комментарий из старых payload мигрируются в закрытые колонки.
7. `submission-config.js` больше не содержит дубликат `CFContent` и не считает реальный publishable key «заглушкой».
8. OpenAI API key и Supabase secret key никогда не передаются браузеру.
9. В rate-limit таблице хранится только salted SHA-256 идентификатор, а не открытый IP.
10. Формы больше не сохраняют без необходимости `navigator.userAgent` и полный URL страницы.

### Планировщик

- логика вынесена в `docs/js/planner-engine.js`;
- аллергии и список «избегать» — жёсткие ограничения;
- любимые продукты влияют на приоритет;
- учитывается тип приёма пищи;
- алгоритм старается не повторять одно и то же блюдо;
- размер порции масштабируется под целевые калории;
- можно заменить конкретное блюдо;
- автоматически строится список покупок;
- добавлены автоматические тесты.

### AI

Новый `docs/ai.html`:

- принимает вопрос обычным языком;
- отправляет только минимальные данные профиля: любимое, исключения, аллергии и расчётную цель;
- передаёт модели максимум 50 уже отфильтрованных блюд;
- требует структурированный JSON-ответ;
- принимает рекомендации только по ID реально переданных блюд;
- не доверяет модели калории/БЖУ как источнику истины;
- имеет серверный лимит запросов;
- содержит медицинский дисклеймер.

### Модерация и главная

- одобренные Supabase-рецепты/материалы теперь догружаются и на главную страницу;
- админка проверяет право через `is_site_admin()`;
- старая инструкция с `adminEmail` заменена;
- формы отправки продолжают работать через тот же пользовательский интерфейс, но теперь вызывают Edge Function.

---

## 2. Как применить patch

Рекомендуется сначала сохранить текущее состояние:

```bash
git checkout -b backup-before-ai
git checkout main
```

Распакуй содержимое архива **в корень репозитория `foods`** с заменой совпадающих файлов.

Папки `docs/data`, `docs/img` и остальные файлы проекта не удаляются.

Ключевые новые файлы:

```text
foods/
  app.py
  package.json
  .env.example
  docs/
    ai.html
    planner.html
    supabase-schema.sql
    css/ai.css
    js/ai.js
    js/planner-engine.js
    js/planner.js
    js/submissions.js
    js/supabase-content.js
  supabase/
    config.toml
    functions/
      ai-assistant/index.ts
      submit-content/index.ts
  tests/
  tools/
```

Полный список замен смотри в `PATCH_MANIFEST.md`.

---

## 3. Проверка локально

### Python preview

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Открой:

```text
http://127.0.0.1:8000
```

### Проверки JavaScript и данных

Нужен Node.js 20+.

```bash
npm test
```

Проверяются:

- синтаксис браузерных JS-файлов;
- тесты движка планировщика;
- структура `products.json` и `dishes.json`;
- дубли/подозрительные названия и несостыковки ингредиентов выводятся как предупреждения.

Edge Functions дополнительно проверяются в GitHub Actions через Deno.

---

## 4. Настройка Supabase

### Шаг 1. Выполни SQL

В Supabase Dashboard открой **SQL Editor** и выполни целиком:

```text
docs/supabase-schema.sql
```

Скрипт рассчитан на применение поверх существующей таблицы `submissions`.

После него анонимный браузер не сможет напрямую писать в таблицу. Поэтому Edge Functions нужно развернуть сразу после SQL.

### Шаг 2. Создай владельца

В **Authentication -> Users** создай пользователя владельца с email и паролем.

Затем в SQL Editor выполни:

```sql
insert into public.site_admins(user_id)
select id
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL')
on conflict (user_id) do nothing;
```

Замени `YOUR_ADMIN_EMAIL` на email созданного Auth-пользователя.

Проверка:

```sql
select a.user_id, u.email, a.created_at
from public.site_admins a
join auth.users u on u.id = a.user_id;
```

После этого вход в `docs/owner-panel.html` будет проверяться сервером.

### Шаг 3. Публичный ключ

В `docs/js/submission-config.js` должны находиться только:

- Project URL;
- publishable key;
- имена Edge Functions.

Текущий публичный URL/key проекта из репозитория уже сохранены в patch. Если ты создашь новый Supabase-проект, замени их на новые публичные значения.

---

## 5. Подключение OpenAI

### Шаг 1. Создай `.env`

Скопируй `.env.example` в `.env`:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
SITE_ORIGINS=https://dafi3134.github.io,http://localhost:8000,http://127.0.0.1:8000
RATE_LIMIT_SALT=очень-длинная-случайная-строка
AI_REQUESTS_PER_HOUR=12
SUBMISSION_REQUESTS_PER_HOUR=6
```

`.env` уже исключён через `.gitignore`.

`RATE_LIMIT_SALT` создай случайным, например средствами менеджера паролей. Не используй показанный пример буквально.

### Шаг 2. Supabase CLI

Установи Supabase CLI, затем:

```bash
supabase login
supabase link --project-ref qygayinuchdngerceupt
```

Передай пользовательские секреты Edge Functions:

```bash
supabase secrets set --env-file .env
```

Supabase сам предоставляет функциям серверные переменные проекта (`SUPABASE_URL`, publishable/secret keys), их вручную в `.env` добавлять не требуется.

### Шаг 3. Разверни обе функции

```bash
supabase functions deploy
```

Или по отдельности:

```bash
supabase functions deploy submit-content
supabase functions deploy ai-assistant
```

В `supabase/config.toml` для обеих функций стоит `verify_jwt = false`: они принимают публичный publishable key и сами проверяют его в коде. Это нужно для нового формата `sb_publishable_...`, который не является JWT.

---

## 6. Проверка полного сценария

После SQL и deploy проверь по порядку:

1. Открой `submit_product.html` и отправь тестовый продукт.
2. Открой `owner-panel.html`, войди владельцем.
3. Убедись, что заявка появилась со статусом `pending`.
4. Нажми «Одобрить».
5. Проверь `products.html`/`library.html` и главную страницу.
6. Открой `ai.html` и задай вопрос, например: «Что выбрать на ужин примерно на 500 ккал?».
7. Открой `planner.html`, создай рацион и попробуй кнопку замены блюда.

---

## 7. GitHub Pages

После проверки:

```bash
git add .
git commit -m "Refactor food app and add secure AI assistant"
git push origin main
```

Если GitHub Pages уже настроен на `/docs` ветки `main`, фронтенд обновится после обычной сборки Pages.

Supabase Edge Functions публикуются отдельно командой `supabase functions deploy` — GitHub Pages их не разворачивает.

---

## 8. Что нельзя делать

- Не вставляй `OPENAI_API_KEY` в `docs/js/ai.js` или любой HTML/JS в `docs/`.
- Не вставляй Supabase secret key в `docs/js/submission-config.js`.
- Не возвращай прямой anonymous `INSERT` в `submissions` без отдельной причины.
- Не отключай RLS у `submissions`, `site_admins` или `request_rate_limits`.
- Не добавляй `author_email`/`moderator_note` в публичное представление.
- Не делай AI единственным механизмом составления рациона: детерминированный планировщик должен работать самостоятельно.
- Не храните `.env` в Git.

---

## 9. Данные, которые стоит улучшить вручную

В текущем репозитории рецептов мало. Чтобы планировщик выглядел убедительно, желательно иметь хотя бы 12–20 разнообразных блюд: несколько завтраков, перекусов, обедов и ужинов.

Запусти:

```bash
npm run check:data
```

В текущих данных есть признаки, которые валидатор должен подсветить, например дубли названий и подозрительные категории. Patch специально не переписывает пищевую ценность автоматически: конфликтующие данные лучше проверить вручную по выбранному источнику.

---

## 10. Частые ошибки

### `401 / Invalid Supabase publishable key`

Проверь `docs/js/submission-config.js`, проект Supabase и что функции развернуты именно в этом проекте.

### `429`

Сработал серверный лимит. Значения по умолчанию:

- AI: 12 запросов/час на hashed client identifier;
- заявки: 6 отправок/час.

### `503` с сообщением про rate limit

Повторно выполни `docs/supabase-schema.sql`. Функции специально не продолжают дорогостоящую/записывающую операцию, если серверная защита не готова.

### `CORS / Origin is not allowed`

Добавь origin сайта в `SITE_ORIGINS`, например:

```text
https://your-domain.example
```

после чего обнови secrets:

```bash
supabase secrets set --env-file .env
```

### Админ входит, но получает «нет прав владельца»

Проверь, что UUID этого Auth-пользователя присутствует в `public.site_admins`.

---

## 11. Как объяснить AI на защите

Можно сказать так:

> В проекте есть обычный детерминированный рекомендательный алгоритм. Он фильтрует блюда по аллергиям и нежелательным продуктам, учитывает тип приёма пищи и регулирует размер порции. AI — отдельный слой. Браузер не обращается к OpenAI напрямую: запрос проходит через Supabase Edge Function, где хранится API-ключ и работает rate limit. Модели передаются только уже допустимые блюда. Она возвращает структурированный ответ с ID рекомендаций, после чего сервер отбрасывает ID, которых не было во входном наборе. Поэтому естественный язык генерирует модель, а критичные ограничения остаются под контролем обычного кода.

### Это нейросеть или нет?

Да: AI-раздел использует готовую большую языковую нейросеть через API. При этом алгоритм планировщика сам по себе нейросетью не является — это обычная рекомендательная логика. Такое разделение корректно и его лучше честно объяснять на защите.

### Как сделать собственную модель позже

Следующий этап — собирать обезличенные события `dish_view`, `like`, `replace`, `selected`, а затем обучить модель ранжирования, которая будет предсказывать вероятность выбора блюда. Сейчас этого не стоит симулировать: без достаточной истории пользователей «собственная нейросеть» будет хуже простого алгоритма.
