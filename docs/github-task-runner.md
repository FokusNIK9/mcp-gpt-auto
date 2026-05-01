# GitHub Task Runner

Этот модуль позволяет управлять локальным ПК через GitHub-очередь задач.

## Принцип работы

1. Пользователь или ChatGPT создаёт JSON-файл задачи в `.agent-queue/inbox/<task-id>.json`.
2. Локальный runner периодически делает `git pull`, находит новые задачи и выполняет их.
3. Результаты (отчёты и JSON-статусы) пушатся обратно в GitHub.

## Очередь задач

- `.agent-queue/inbox/` — новые задачи.
- `.agent-queue/running/` — текущая выполняемая задача.
- `.agent-queue/done/` — успешно завершённые задачи (JSON).
- `.agent-queue/failed/` — задачи с ошибками (JSON).
- `.agent-queue/reports/` — подробные Markdown-отчёты.

## Формат задачи

```json
{
  "taskId": "2026-05-01-test-001",
  "title": "Check local agent",
  "createdAt": "2026-05-01T00:00:00.000Z",
  "createdBy": "chatgpt",
  "type": "shell",
  "priority": "normal",
  "workspace": ".",
  "allowedFiles": ["*"],
  "instructions": "Run build",
  "commands": [
    {
      "command": "npm",
      "args": ["run", "build"]
    }
  ],
  "requiresPush": true
}
```

## Запуск Runner на ПК

### Одиночный проход

```bat
scripts\win\20-run-task-runner-once.bat
```

### Бесконечный цикл

```bat
set CONFIRM_PUSH=YES
scripts\win\21-run-task-runner-loop.bat
```

Интервал проверки по умолчанию — 30 секунд. Можно изменить через `RUNNER_INTERVAL_SECONDS`.
