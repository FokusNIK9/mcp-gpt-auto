# Agentic MCP Mode — план локальных инструментов

Цель: сделать локальную MCP-систему для работы на твоём ПК, где чат остаётся центром управления, а агент получает контролируемые действия: скриншот, файлы, shell, git, GitHub, браузер, саб-агентов Gemini, тесты, debug и review.

## 1. Главный принцип

Пользователь управляет всем через чат. MCP даёт инструменты, но не бесконтрольную автономность.

Уровни действий:

| Уровень | Примеры | Правило |
|---|---|---|
| Safe | скриншот, чтение файлов workspace, `git status`, логи | можно автоматически |
| Normal | патч файлов workspace, запуск тестов, build | можно по задаче |
| Risky | `git push`, установка пакетов, клики/ввод на ПК, сетевые вызовы | только с разрешением |
| Forbidden | удаление вне workspace, чтение секретов, отправка приватных данных | нельзя |

## 2. Локальная архитектура

```text
ChatGPT / главный агент
  -> Local MCP Gateway
      -> desktop MCP
      -> filesystem MCP
      -> shell MCP
      -> git MCP
      -> github MCP
      -> browser/devtools MCP
      -> subagents MCP
      -> tasks/memory MCP
      -> review/debug MCP
      -> secrets/policy MCP
```

`Local MCP Gateway` — единая точка входа. Он проверяет policy, workspace, allowlist команд, пишет audit log и маршрутизирует вызовы.

## 3. Нужные MCP tools

### 3.1 gateway

- `gateway.health`
- `gateway.capabilities`
- `gateway.policy.get`
- `gateway.policy.set`
- `gateway.audit.list`
- `gateway.workspace.get`
- `gateway.workspace.set`

### 3.2 desktop

- `desktop.screenshot`
- `desktop.active_window`
- `desktop.window_list`
- `desktop.focus_window`
- `desktop.click`
- `desktop.type_text`
- `desktop.hotkey`
- `desktop.scroll`
- `desktop.clipboard_get`
- `desktop.clipboard_set`

Первый MVP-инструмент: `desktop.screenshot`.

Пример ответа:

```json
{
  "ok": true,
  "screen": {
    "width": 2560,
    "height": 1440,
    "activeWindow": "Visual Studio Code",
    "imagePath": ".agent/artifacts/screenshots/2026-05-01_120000.png"
  }
}
```

### 3.3 filesystem

- `fs.read`
- `fs.write`
- `fs.patch`
- `fs.delete`
- `fs.move`
- `fs.copy`
- `fs.list`
- `fs.search`
- `fs.grep`
- `fs.tree`
- `fs.stat`

Правило: по умолчанию только внутри `workspace`. `.env`, ключи и токены не читать без отдельного разрешения.

### 3.4 shell

- `shell.run`
- `shell.start`
- `shell.stdin`
- `shell.stop`
- `shell.process_list`
- `shell.process_logs`
- `shell.which`

Пример ответа:

```json
{
  "ok": true,
  "exitCode": 0,
  "stdout": "...",
  "stderr": "...",
  "durationMs": 1234,
  "cwd": "C:/projects/app",
  "command": "npm test"
}
```

Команды через allowlist: `git`, `node`, `npm`, `pnpm`, `dotnet`, `python`, `gemini`, `powershell`, `cmd`.

### 3.5 git

- `git.status`
- `git.diff`
- `git.log`
- `git.branch`
- `git.checkout`
- `git.add`
- `git.commit`
- `git.push`
- `git.pull`
- `git.restore`
- `git.clean_preview`

Перед коммитом всегда `git.diff`. `git.push` только после разрешения.

### 3.6 github

- `github.repo.get`
- `github.file.get`
- `github.file.put`
- `github.issue.create`
- `github.issue.comment`
- `github.pr.create`
- `github.pr.review`
- `github.checks.list`
- `github.workflow.run`
- `github.workflow.logs`

### 3.7 browser/devtools

- `browser.open`
- `browser.goto`
- `browser.screenshot`
- `browser.dom_snapshot`
- `browser.console_logs`
- `browser.network_logs`
- `browser.click`
- `browser.type`
- `browser.evaluate_js`
- `browser.performance_trace`

Нужно для UI/debug цикла: запустить dev-server, открыть страницу, снять скриншот, прочитать console/network errors, исправить, перепроверить.

### 3.8 subagents

- `subagent.run`
- `subagent.start`
- `subagent.status`
- `subagent.logs`
- `subagent.stop`
- `subagent.result`

Первый саб-агент: Gemini CLI. Фактические флаги надо проверить на ПК через `gemini --help`.

## 4. Контракт саб-агента Gemini

Главный агент создаёт задачу:

```text
.agent/tasks/<task-id>/prompt.md
```

Саб-агент получает ограниченный контекст:

- цель задачи;
- workspace;
- allowed files;
- запрет на `git push`;
- запрет на секреты;
- требование вернуть JSON.

Ожидаемый результат:

```json
{
  "status": "success|partial|failed",
  "summary": "короткое описание",
  "filesChanged": [
    {
      "path": "src/example.ts",
      "reason": "что изменено"
    }
  ],
  "commandsRun": [
    {
      "command": "npm test",
      "exitCode": 0,
      "summary": "passed"
    }
  ],
  "tests": {
    "ran": true,
    "passed": true,
    "details": "..."
  },
  "risks": [],
  "requiresApproval": [],
  "nextSteps": []
}
```

## 5. Поток Gemini -> review -> GitHub

```text
subagent.run
  -> .agent/tasks/<id>/subagent-result.json
  -> главный агент валидирует JSON
  -> git.status + git.diff
  -> review.run
  -> build/test/debug
  -> final review
  -> commit
  -> push только если разрешено
  -> task.done
```

Артефакты задачи:

```text
.agent/tasks/<id>/
  prompt.md
  subagent-stdout.log
  subagent-stderr.log
  subagent-result.json
  review.md
  debug.log
  final.md
```

## 6. Review pipeline главного агента

1. `git.status`
2. `git.diff`
3. Проверить allowed files.
4. Проверить отсутствие секретов.
5. Проверить стиль проекта.
6. Запустить lint/build/test.
7. Если UI — браузер + screenshot + console logs.
8. Если runtime — process logs.
9. Составить `review.md`.
10. Если всё ок — `task.done`.

Review result:

```json
{
  "status": "approved|needs_changes|rejected",
  "summary": "...",
  "diffReviewed": true,
  "tests": {
    "build": "passed|failed|skipped",
    "unit": "passed|failed|skipped",
    "lint": "passed|failed|skipped",
    "runtime": "passed|failed|skipped"
  },
  "issues": [],
  "decision": "commit|request_subagent_fix|ask_user"
}
```

## 7. Debug loop

```text
PLAN
  -> IMPLEMENT / SUBAGENT
  -> REVIEW DIFF
  -> BUILD
  -> TEST
  -> RUN
  -> OBSERVE SCREEN/LOGS
  -> FIX
  -> FINAL REVIEW
  -> COMMIT
  -> MARK DONE
```

## 8. MVP

Минимально надо реализовать:

1. `desktop.screenshot`
2. `fs.read`, `fs.write`, `fs.patch`, `fs.tree`
3. `shell.run`
4. `git.status`, `git.diff`, `git.commit`
5. `subagent.run` для Gemini CLI
6. `task.create`, `task.update`, `task.done`
7. `review.run`

## 9. Предлагаемый стек

- TypeScript / Node.js
- MCP SDK
- Windows-first: PowerShell/cmd
- `zod` для схем
- `pino` для логов
- `vitest` для тестов
- Playwright для browser/devtools
- safe shell wrapper вместо прямого опасного shell

## 10. Структура репозитория

```text
mcp-gpt-auto/
  README.md
  docs/
    agentic-mcp-plan.md
    security-policy.md
    subagent-contract.md
  src/
    gateway/
    servers/
      desktop/
      filesystem/
      shell/
      git/
      github/
      browser/
      subagents/
      tasks/
      review/
  schemas/
    tool-result.schema.json
    task.schema.json
    subagent-result.schema.json
    review-result.schema.json
  examples/
    gemini-task.prompt.md
    mcp-client-config.example.json
```

## 11. Первый этап реализации

Stage 1:

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/gateway/tool-registry.ts`
- `src/gateway/policy.ts`
- `src/gateway/audit-log.ts`
- `src/servers/filesystem.ts`
- `src/servers/shell.ts`
- `schemas/*.json`
- README с установкой

Stage 2:

- `src/servers/subagents/gemini.ts`
- генерация prompt;
- запуск Gemini CLI;
- сохранение stdout/stderr;
- парсинг `SubagentResult`;
- fallback при невалидном JSON.

Stage 3:

- `src/servers/review.ts`
- `review.run`
- `debug.run`
- `task.done`
- интеграция с git diff/test/build.

Stage 4:

- desktop screenshot;
- active window;
- browser screenshot/logs;
- осторожные click/type только после разрешения.

## 12. Команды проверки на ПК

```powershell
node --version
npm --version
git --version
gemini --version
gemini --help
```

## 13. Критерии готовности

Полный агентный режим готов, когда:

- агент получает screenshot ПК;
- читает и патчит файлы только в workspace;
- запускает команды и получает stdout/stderr;
- запускает Gemini CLI с задачей;
- сохраняет ответ Gemini как JSON и лог;
- сам делает review diff;
- запускает build/test/debug;
- пишет финальный отчёт;
- делает commit;
- делает push только после разрешения;
- каждый шаг виден в audit log.
