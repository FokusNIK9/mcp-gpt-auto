# Контракт саб-агента

Саб-агент — это внешний CLI-агент, например Gemini CLI, которого запускает главный агент.

Саб-агент не принимает финальные решения. Он выполняет ограниченную задачу и возвращает структурированный результат.

## Обязательные правила

Саб-агент обязан:

- работать только внутри указанного workspace;
- менять только `Allowed files`;
- не делать `git push`;
- не читать секреты;
- не устанавливать пакеты без явного запроса;
- не запускать опасные команды;
- вернуть итог в JSON-блоке `SubagentResult`.

## Формат prompt

```md
# Role

Ты саб-агент разработки. Главный агент будет ревьюить твои изменения.

# Task

<задача>

# Workspace

<путь>

# Allowed files

- <file-or-dir>

# Hard constraints

- Do not run git push.
- Do not read secrets.
- Do not modify files outside Allowed files.
- Do not install packages without requesting approval.
- Return result as SubagentResult JSON.

# Expected output

Return exactly one JSON block:

```json
{
  "status": "success|partial|failed",
  "summary": "...",
  "filesChanged": [],
  "commandsRun": [],
  "tests": {
    "ran": false,
    "passed": false,
    "details": ""
  },
  "risks": [],
  "requiresApproval": [],
  "nextSteps": []
}
```
```

## JSON schema

Основная схема лежит в:

```text
schemas/subagent-result.schema.json
```

## Правило для главного агента

Даже если саб-агент вернул `success`, это не значит, что задача завершена.

Главный агент обязан проверить:

1. `git status`;
2. `git diff`;
3. список изменённых файлов;
4. отсутствие секретов;
5. тесты/сборку;
6. соответствие задаче;
7. риски.

Только после этого можно `task.done`.
