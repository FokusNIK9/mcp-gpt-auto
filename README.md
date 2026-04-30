# mcp-gpt-auto

Локальная агентная система для работы с твоим ПК через управляемые MCP-tools.

Цель проекта: оставить чат главным центром управления, но дать агенту безопасные локальные руки:

- читать и патчить файлы в workspace;
- запускать команды;
- получать скриншот;
- гонять тесты;
- запускать Gemini CLI как саб-агента;
- принимать от саб-агента структурированный результат;
- делать review/diff/debug;
- коммитить и пушить только по политике.

## Текущий MVP

MVP делится на два слоя.

### MVP-0: GitHub transport + Windows BAT

Это самый быстрый рабочий цикл без полноценного MCP-сервера:

1. скачать/обновить репозиторий с GitHub;
2. создать `.agent/tasks/<task-id>/prompt.md`;
3. запустить Gemini CLI по этому prompt;
4. сохранить stdout/stderr/result;
5. собрать review bundle;
6. закоммитить и запушить результат после проверки.

Скрипты лежат в:

```text
scripts/win/
```

### MVP-1: настоящий MCP

После MVP-0 добавляется TypeScript MCP Gateway:

- `fs.read/fs.write/fs.patch`;
- `shell.run`;
- `git.status/git.diff/git.commit`;
- `desktop.screenshot`;
- `subagent.run`;
- `review.run`;
- `task.done`.

## Быстрый старт на Windows

```bat
git clone https://github.com/FokusNIK9/mcp-gpt-auto.git
cd mcp-gpt-auto

scripts\win\00-bootstrap.bat
scripts\win\01-sync-from-github.bat
scripts\win\02-new-task.bat test-task "Проверить рабочий цикл"
scripts\win\03-run-gemini-task.bat test-task
scripts\win\04-review-bundle.bat test-task
```

Пушить изменения:

```bat
scripts\win\05-push-to-github.bat "Update agent MVP files"
```

По умолчанию `05-push-to-github.bat` требует ручного подтверждения через переменную:

```bat
set CONFIRM_PUSH=YES
scripts\win\05-push-to-github.bat "commit message"
```

## Документы

- [`docs/agentic-mcp-plan.md`](docs/agentic-mcp-plan.md) — общий план полного агентного режима.
- [`docs/mvp-self-improving-agent-plan.md`](docs/mvp-self-improving-agent-plan.md) — пошаговый рабочий MVP.
- [`docs/subagent-contract.md`](docs/subagent-contract.md) — формат задач и ответов саб-агента.
- [`docs/security-policy.md`](docs/security-policy.md) — политика безопасности.
- [`docs/operator-workflow.md`](docs/operator-workflow.md) — как управлять циклом из чата.

## Главный принцип

Агент не получает “полную свободу”. Агент получает воспроизводимый цикл:

```text
task -> subagent -> result -> review -> debug -> commit -> done
```

Каждый шаг должен оставлять след в `.agent/tasks/<task-id>/`.
