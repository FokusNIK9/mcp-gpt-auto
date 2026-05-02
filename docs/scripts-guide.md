# Scripts Guide

Документ описывает скрипты и связанные служебные файлы проекта `mcp-gpt-auto`: что они делают, как запускать их вручную, какие аргументы они принимают и как они связаны с `Launcher.ps1`.

## Быстрый обзор

| Путь | Тип | Назначение |
| --- | --- | --- |
| `Launcher.ps1` | PowerShell launcher | Единая точка запуска локального Action Bridge и task runner. |
| `scripts/smoke-test.js` | Node.js | Smoke-тест MCP server/tools, генерация отчёта `docs/mcp-inspector-smoke-test.md`, попытка сделать screenshot через MCP tool. |
| `scripts/test-redaction.js` | Node.js | Проверка функций редактирования/маскирования секретов из `dist/gateway/redact.js`. |
| `scripts/win/31-queue-task.ps1` | PowerShell | Создание JSON-задачи в `.agent-queue/inbox` для ручной постановки задач task runner'у. |
| `scripts/win/phase2/getscreen-via-github-buffer/scripts/capture_and_validate_screenshot.py` | Python | Захват, валидация и опциональная публикация immutable screenshot через GitHub raw URL. |
| `local-screenshot/scripts/capture.ps1` | PowerShell | Минимальный локальный захват primary screen в PNG-файл. |
| `scripts/win/phase2/getscreen-via-github-buffer/SKILL.md` | Skill-инструкция | Протокол `getscreen-via-github-buffer` для capture/publish/analyze пайплайна. |
| `scripts/win/phase2/getscreen-via-github-buffer/agents/openai.yaml` | Skill config | Конфигурационный файл агента для локального Skill-пакета. |
| `scripts/win/phase2/archive` | Заметки | Архив обсуждения архитектуры screenshot Skill/MCP adapter. |
| `scripts/win/phase2/read-adn delet.txt` | Заметки | Исторические инструкции по обновлению Action/OpenAPI/ngrok и GitHub private/raw нюансам. |

---

## `Launcher.ps1`

### Назначение

`Launcher.ps1` — главный Windows launcher проекта. Он подготавливает окружение, подхватывает ngrok URL, проверяет токен, при необходимости собирает проект, запускает task runner в background job и стартует Action Bridge в текущем терминале.

### Что делает по шагам

1. Проверяет, свободен ли порт `8787` на `127.0.0.1`.
2. Если порт занят, предлагает остановить процесс, который его занимает.
3. Пытается получить публичный ngrok URL через локальный API:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels"
   ```
4. Если ngrok URL найден, устанавливает:
   ```powershell
   $env:ACTION_BRIDGE_PUBLIC_URL = $publicUrl
   ```
5. Загружает переменные окружения из `.env`.
6. Проверяет наличие `ACTION_BRIDGE_TOKEN`; если его нет, запрашивает токен интерактивно.
7. Проверяет наличие папки `dist`:
   - если `dist` отсутствует — запускает `npm run build`;
   - если `dist` уже есть — сборку пропускает.
8. Останавливает старый background job `mcp-runner`, если он существует.
9. Запускает runner в background job:
   ```powershell
   node dist/runner/github-task-runner.js --loop
   ```
10. Запускает Action Bridge в текущем окне:
    ```powershell
    node dist/action-bridge/server.js
    ```
11. Показывает dashboard URL:
    ```text
    http://127.0.0.1:8787/ui
    ```

### Ручной запуск

Из корня проекта:

```powershell
.\Launcher.ps1
```

### Аргументы

Скрипт не принимает CLI-аргументы. Основные настройки зашиты внутри файла:

| Переменная | Значение по умолчанию | Назначение |
| --- | --- | --- |
| `$PORT` | `8787` | Локальный порт Action Bridge. |
| `$HOST_ADDR` | `127.0.0.1` | Локальный host для dashboard. |
| `ACTION_BRIDGE_PUBLIC_URL` | берётся из ngrok API | Публичный URL для OpenAPI schema и GPT Action. |
| `ACTION_BRIDGE_TOKEN` | из `.env` или интерактивно | API key для Action Bridge. |

### Важные замечания

- `Launcher.ps1` не вызывает напрямую файлы из `scripts/`, кроме логически связанного runner из `dist/runner/github-task-runner.js`.
- Автосборка выполняется только если папки `dist` нет. Если код в `src/` изменился, нужно вручную выполнить:
  ```powershell
  npm run build
  ```
- Для просмотра логов runner job:
  ```powershell
  Receive-Job -Name mcp-runner -Keep
  ```

---

## `scripts/smoke-test.js`

### Назначение

Node.js smoke-test для проверки локального MCP-сервера и ключевых tools. Скрипт запускает `dist/index.js` через `StdioClientTransport`, подключается MCP client'ом и последовательно вызывает набор инструментов.

### Что проверяет

Список tools внутри `toolsToTest`:

| Tool | Аргументы | Что проверяется |
| --- | --- | --- |
| `gateway.health` | `{}` | Доступность gateway/server health. |
| `fs.list` | `{ path: "." }` | Чтение списка файлов workspace. |
| `fs.tree` | `{ path: ".", depth: 2 }` | Рекурсивное дерево workspace. |
| `git.status` | `{}` | Git status. |
| `git.diff` | `{ stat: true }` | Git diff summary/stat. |
| `desktop.screenshot` | `{}` | Снимок экрана через desktop MCP tool. |
| `review.run` | `{ taskId: "smoke-test", runBuild: false }` | Review pipeline без запуска build. |

После выполнения скрипт создаёт Markdown-отчёт:

```text
docs/mcp-inspector-smoke-test.md
```

В отчёте есть таблица статусов и raw JSON outputs. Перед записью отчёта скрипт дополнительно санитизирует потенциально чувствительные строки.

### Ручной запуск

Из корня проекта:

```powershell
node scripts/smoke-test.js
```

### Аргументы

CLI-аргументы не поддерживаются. Внутри файла захардкожены:

| Константа | Значение | Назначение |
| --- | --- | --- |
| `serverPath` | `C:/Users/user/Documents/trash/Program/2026-05/01.05/mcp-gpt-auto/dist/index.js` | Путь к MCP server entrypoint. |
| `workspacePath` | `C:/Users/user/Documents/trash/Program/2026-05/01.05/mcp-gpt-auto` | Workspace path для `MCP_GPT_AUTO_WORKSPACE`. |
| `reportPath` | `docs/mcp-inspector-smoke-test.md` | Куда сохраняется отчёт. |

### Exit code

- `0` — все tools прошли успешно.
- `1` — ошибка подключения или хотя бы один tool вернул ошибку.

### Когда использовать

- После изменения MCP tools.
- После пересборки `dist`.
- Для быстрой проверки, что bridge/server/tooling живы.
- Для финальной smoke-проверки с dashboard/screenshot side effect.

---

## `scripts/test-redaction.js`

### Назначение

Тестирует функции маскирования секретов:

```js
import { redactText, redactSecrets } from "../dist/gateway/redact.js";
```

Скрипт прогоняет набор строк и вложенный объект через redaction-функции, печатает результат и проверяет, что типичные паттерны секретов не просочились в output.

### Что проверяется

Проверяются утечки подстрок вроде:

- `ghp_`
- `github_pat_`
- `sk-`
- `glpat-`
- `BEGIN PRIVATE KEY`

Также проверяется вложенный объект с полями вроде `token`, `apiKey`, `secret`.

### Ручной запуск

Из корня проекта:

```powershell
node scripts/test-redaction.js
```

Перед запуском нужен актуальный `dist`, потому что импорт идёт из `../dist/gateway/redact.js`:

```powershell
npm run build
node scripts/test-redaction.js
```

### Аргументы

CLI-аргументы не поддерживаются.

### Exit code

- `0` — тесты прошли, секреты не обнаружены в redacted output.
- `1` — найден потенциальный leak.

### Когда использовать

- После правок `src/gateway/redact.ts`.
- Перед публикацией логов/отчётов.
- После расширения списка secret-patterns.

---

## `scripts/win/31-queue-task.ps1`

### Назначение

PowerShell-утилита для ручного создания JSON-задачи в очереди runner'а. Скрипт пишет файл в:

```text
.agent-queue/inbox/<taskId>.json
```

Runner затем может подобрать эту задачу из inbox.

### Ручной запуск

Минимально:

```powershell
.\scripts\win\31-queue-task.ps1
```

С явными параметрами:

```powershell
.\scripts\win\31-queue-task.ps1 "my-task" "Build project" "shell" "npm run build"
```

Несколько команд можно передать остаточными аргументами:

```powershell
.\scripts\win\31-queue-task.ps1 "audit" "Audit scripts" "shell" "npm run build" "npm test"
```

### Аргументы

| Позиция | Имя | Тип | Обязательный | Значение по умолчанию | Назначение |
| --- | --- | --- | --- | --- | --- |
| `0` | `$taskId` | `string` | Нет | `<yyyy-MM-dd>-task-<random>` | ID создаваемой задачи. |
| `1` | `$title` | `string` | Нет | `Manual Task: <taskId>` | Человекочитаемый заголовок. |
| `2` | `$type` | `string` | Нет | `shell` | Тип задачи. |
| `3+` | `$commands` | `string[]` | Нет | `npm run build` | Команды, которые попадут в JSON task. |

### Формат создаваемой задачи

Скрипт формирует объект с полями:

- `taskId`
- `title`
- `createdAt`
- `createdBy = "manual-cli"`
- `type`
- `priority = "normal"`
- `workspace = "."`
- `allowedFiles`
- `instructions`
- `commands`
- `requiresPush = true`

`allowedFiles` по умолчанию включает:

```text
README.md
docs/**
scripts/**
src/**
.agent-queue/**
package.json
tsconfig.json
```

### Ограничения

- Разбор команд очень простой: `$cmdStr -split " "`.
- Сложные аргументы с кавычками или пробелами могут распарситься не так, как ожидается.
- Для сложных задач лучше вручную отредактировать JSON или использовать API `queueTask`.

---

## `scripts/win/phase2/getscreen-via-github-buffer/scripts/capture_and_validate_screenshot.py`

### Назначение

Python backend для протокола `getscreen-via-github-buffer`. Скрипт делает screenshot, валидирует PNG, создаёт immutable unique-файл, обновляет `screenshots/latest-screenshot.png` и опционально коммитит/пушит оба файла в GitHub.

Главная идея: GitHub используется как transport buffer для изображения, но сам скрипт не выполняет visual analysis. Он возвращает только JSON metadata. Анализ должен выполняться отдельно по commit-pinned `raw.githubusercontent.com` URL.

### Что делает

1. Определяет текущее UTC-время.
2. Сохраняет screenshot в `screenshots/latest-screenshot.png`, если не указан `--validate-only`.
3. Валидирует PNG:
   - файл существует;
   - размер больше `--min-bytes`;
   - ширина не меньше `--min-width`;
   - высота не меньше `--min-height`;
   - sampled unique colors не меньше `--min-colors`;
   - считается `sha256`.
4. Создаёт unique path:
   ```text
   screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png
   ```
5. Копирует validated PNG в unique path.
6. При `--publish` делает:
   ```bash
   git add -- <unique_path> <latest_path>
   git commit -m "Update screenshot capture <shortsha>" -- <unique_path> <latest_path>
   git push origin <branch>
   git rev-parse HEAD
   ```
7. Возвращает JSON с блоками:
   - `mode`
   - `capture`
   - `freshness`
   - `publish`
   - `analysis`

Важно: даже после успешного publish поле `analysis.ok` остаётся `false`, потому что скрипт не смотрит на изображение глазами/vision pipeline.

### Ручной запуск

Capture + validation без публикации:

```powershell
python scripts\win\phase2\getscreen-via-github-buffer\scripts\capture_and_validate_screenshot.py
```

Capture + validation + commit/push:

```powershell
python scripts\win\phase2\getscreen-via-github-buffer\scripts\capture_and_validate_screenshot.py --publish
```

Только validation уже существующего `latest-screenshot.png`:

```powershell
python scripts\win\phase2\getscreen-via-github-buffer\scripts\capture_and_validate_screenshot.py --validate-only
```

С кастомными owner/repo/branch:

```powershell
python scripts\win\phase2\getscreen-via-github-buffer\scripts\capture_and_validate_screenshot.py --publish --owner FokusNIK9 --repo mcp-gpt-auto --branch main
```

### Аргументы

| Аргумент | Тип | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `--latest-output` | string | `screenshots/latest-screenshot.png` | Путь для mutable latest PNG. |
| `--unique-dir` | string | `screenshots` | Папка для immutable unique PNG. |
| `--owner` | string | `FokusNIK9` | GitHub owner для raw URL. |
| `--repo` | string | `mcp-gpt-auto` | GitHub repo для raw URL. |
| `--branch` | string | `main` | Branch для push и main raw URL. |
| `--publish` | flag | false | Коммитит и пушит screenshot-файлы. |
| `--validate-only` | flag | false | Не делает новый screenshot, валидирует существующий latest-файл. |
| `--min-bytes` | int | `1024` | Минимальный размер PNG. |
| `--min-width` | int | `320` | Минимальная ширина PNG. |
| `--min-height` | int | `200` | Минимальная высота PNG. |
| `--min-colors` | int | `16` | Минимальное число sampled unique colors. |

### Dependencies

- Python 3.
- `Pillow` / `PIL`:
  - `ImageGrab` для capture;
  - `Image` для validation.
- Git CLI.
- Настроенный remote `origin` и права на push, если используется `--publish`.

### Exit code

- `0` — capture/validation прошли успешно.
- `1` — validation не прошла.
- `2` — capture через `ImageGrab` упал.

### Git hygiene

Скрипт специально stage/commit только два файла:

```text
screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png
screenshots/latest-screenshot.png
```

Он также собирает `git status --short` и отмечает unrelated changes как ignored, чтобы не трогать чужие изменения.

---

## `local-screenshot/scripts/capture.ps1`

### Назначение

Минимальный PowerShell script для локального screenshot primary screen. Использует .NET assemblies:

```powershell
System.Windows.Forms
System.Drawing
```

Сохраняет PNG и выводит путь.

### Ручной запуск

С путём по умолчанию:

```powershell
.\local-screenshot\scripts\capture.ps1
```

По умолчанию файл сохраняется в:

```text
$env:TEMP\gemini-screenshot.png
```

С кастомным output path:

```powershell
.\local-screenshot\scripts\capture.ps1 -OutputPath "screenshots\manual.png"
```

### Аргументы

| Аргумент | Тип | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `-OutputPath` | string | `$env:TEMP\gemini-screenshot.png` | Куда сохранить PNG. |

### Ограничения

- Захватывает только `PrimaryScreen`.
- Не валидирует PNG.
- Не публикует файл в GitHub.
- Не выполняет visual analysis.

---

## `scripts/win/phase2/getscreen-via-github-buffer/SKILL.md`

### Назначение

Это инструкция для Skill/agent протокола `getscreen-via-github-buffer`.

Ключевые параметры протокола:

```text
Version: 2.0.0
Protocol: commit-pinned-capture
Status: active
Deprecated protocols: mutable-latest-analysis
```

### Ключевые правила

- `latest-screenshot.png` — только convenience pointer, не доказательство анализа.
- Для анализа нужно использовать immutable URL вида:
  ```text
  https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/<COMMIT_SHA>/screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png
  ```
- `raw_url ≠ visual_analysis`.
- `analysis.ok=true` можно выставлять только после реальной загрузки commit-pinned PNG как изображения.
- Нельзя отвечать о содержимом экрана только по metadata: path, sha256, width, height, raw_url, commit_sha.

### Связь с Python script

`SKILL.md` рекомендует использовать backend:

```text
scripts/capture_and_validate_screenshot.py
```

В текущем дереве проекта этот backend лежит здесь:

```text
scripts/win/phase2/getscreen-via-github-buffer/scripts/capture_and_validate_screenshot.py
```

---

## `scripts/win/phase2/getscreen-via-github-buffer/agents/openai.yaml`

### Назначение

Конфигурационный файл агента для Skill-пакета `getscreen-via-github-buffer`.

### Как использовать

Файл не является исполняемым скриптом. Он должен читаться runtime'ом/упаковщиком Skill или использоваться как reference config при интеграции Skill с агентом.

Ручной запуск не предусмотрен.

---

## `scripts/win/phase2/archive`

### Назначение

Текстовый архив обсуждения архитектуры screenshot-интеграции. В нём зафиксирована идея: локальный Skill не является магическим runtime'ом для MCP, поэтому нужен adapter:

```text
SKILL.md = инструкция для агента
scripts/*.py = исполняемый backend
MCP tool = мост между агентом и скриптом
```

### Ручной запуск

Не запускается. Это справочный текст.

---

## `scripts/win/phase2/read-adn delet.txt`

### Назначение

Исторический текстовый файл с заметками по обновлению Action Bridge/OpenAPI/ngrok и обсуждением GitHub private/raw links.

### Полезные выводы из файла

- Action Bridge работает через ngrok → localhost, а не напрямую через GitHub.
- При private GitHub repo обычные `raw.githubusercontent.com` ссылки на файлы могут требовать авторизацию.
- Для публичных image links в private repo лучше использовать подход, который даёт публичный hosted URL, либо держать repo/артефакты публичными в нужной части.

### Ручной запуск

Не запускается. Это справочный/исторический файл.

---

## Практические сценарии

### Запустить весь локальный bridge

```powershell
.\Launcher.ps1
```

### Пересобрать проект и проверить smoke-test

```powershell
npm run build
node scripts/smoke-test.js
```

### Проверить redaction после изменения кода

```powershell
npm run build
node scripts/test-redaction.js
```

### Создать задачу runner'у вручную

```powershell
.\scripts\win\31-queue-task.ps1 "docs-audit" "Audit docs" "shell" "npm run build"
```

### Сделать локальный screenshot без GitHub publish

```powershell
python scripts\win\phase2\getscreen-via-github-buffer\scripts\capture_and_validate_screenshot.py
```

### Сделать screenshot и опубликовать immutable raw URL

```powershell
python scripts\win\phase2\getscreen-via-github-buffer\scripts\capture_and_validate_screenshot.py --publish
```

### Быстрый primary screen capture в temp

```powershell
.\local-screenshot\scripts\capture.ps1
```

---

## Рекомендации по улучшению скриптов

1. В `scripts/smoke-test.js` стоит убрать hardcoded absolute paths и заменить их на вычисление от repo root.
2. В `scripts/win/31-queue-task.ps1` стоит заменить простой `-split " "` на более надёжный parser аргументов или принимать JSON commands.
3. Для screenshot pipeline стоит выбрать один canonical path для backend script. Сейчас `SKILL.md` говорит про `scripts/capture_and_validate_screenshot.py`, а фактический файл лежит глубже в `scripts/win/phase2/getscreen-via-github-buffer/scripts/`.
4. `local-screenshot/scripts/capture.ps1` можно дополнить validation metadata, чтобы он был совместим с более строгим протоколом `getscreen-via-github-buffer`.
5. Исторические файлы `archive` и `read-adn delet.txt` лучше переместить в `docs/archive/` или переименовать, чтобы папка `scripts/` содержала только исполняемые инструменты и их непосредственную конфигурацию.
