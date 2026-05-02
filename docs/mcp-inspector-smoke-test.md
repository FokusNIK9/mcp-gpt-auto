# MCP Inspector Smoke Test Report

Generated: 2026-05-02T09:39:16.094Z

| Tool | Status | Details |
| --- | --- | --- |
| gateway.health | ✅ OK | Success |
| fs.list | ✅ OK | Success |
| fs.tree | ✅ OK | Success |
| git.status | ✅ OK | Success |
| git.diff | ✅ OK | Success |
| desktop.screenshot | ✅ OK | Success |
| review.run | ✅ OK | Success |

## Raw Outputs
### gateway.health
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"ok\": true,\n  \"root\": \"C:\\\\Users\\\\user\\\\Documents\\\\trash\\\\Program\\\\2026-05\\\\01.05\\\\mcp-gpt-auto\",\n  \"agent\": \"C:\\\\Users\\\\user\\\\Documents\\\\trash\\\\Program\\\\2026-05\\\\01.05\\\\mcp-gpt-auto\\\\.agent\"\n}"
    }
  ]
}
```
### fs.list
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"ok\": true,\n  \"path\": \"\",\n  \"entries\": [\n    {\n      \"name\": \".agent\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".agent-queue\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".agent-workspace\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"[REDACTED_A]\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \".git\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".gitignore\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"action-promt2.txt\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"addons\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"api-docs-knowledge.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"dist\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"docs\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"examples\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"Launcher.ps1\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"local-screenshot\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"local-screenshot.skill\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"logs\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"main-plan.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"node_modules\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"openapi\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"package-lock.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"package.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"README.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"schemas\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"screenshots\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"scripts\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"src\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"tsconfig.json\",\n      \"isDirectory\": false\n    }\n  ]\n}"
    }
  ]
}
```
### fs.tree
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"ok\": true,\n  \"path\": \"\",\n  \"tree\": [\n    {\n      \"name\": \".agent\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"artifacts\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"logs\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"policy.example.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"tasks\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \".agent-queue\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"done\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"failed\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"inbox\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"README.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"reports\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"running\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \".agent-workspace\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"dashboard-2-ui.pid\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"logs\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"scripts\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"temp\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"[REDACTED_A]\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \".gitignore\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"action-promt2.txt\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"addons\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"firefox-action-confirm\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"api-docs-knowledge.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"dist\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"action-bridge\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"gateway\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"index.js\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"runner\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"servers\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"docs\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"agentic-mcp-plan.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"github-task-runner.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"gpt-action-bridge.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"mcp-inspector-smoke-test.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"scripts-guide.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"security-redaction.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"subagent-contract.md\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"examples\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"gemini-task.prompt.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"github-task.example.json\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"Launcher.ps1\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"local-screenshot\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"assets\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"references\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"scripts\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"SKILL.md\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"local-screenshot.skill\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"logs\",\n      \"isDirectory\": true,\n      \"children\": []\n    },\n    {\n      \"name\": \"main-plan.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"openapi\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"gpt-action-bridge.openapi.yaml\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"package-lock.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"package.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"README.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"schemas\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"review-result.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"subagent-result.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"task.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"tool-result.schema.json\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"screenshots\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"capture-20260502-071313-bbe82e7e.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-071418-a66ac1ad.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-071754-95c47250.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-072136-e667eae9.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-072206-f9afd161.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-072320-71418255.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-074030-7df7a7ce.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-074553-6a0dc9af.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-074702-5a875e06.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-074831-857efa69.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-081719-a556ead1.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-082050-966ba015.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-082203-f597ccbb.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-082228-740f1239.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-082245-1ac10fc7.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-082522-6d4ef9d2.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-082558-46d10959.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-082633-c5a3ce7c.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"latest-screenshot.png\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"scripts\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"smoke-test.js\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"test-redaction.js\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"win\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"src\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"action-bridge\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"gateway\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"index.ts\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"runner\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"servers\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"tsconfig.json\",\n      \"isDirectory\": false\n    }\n  ]\n}"
    }
  ]
}
```
### git.status
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"ok\": true,\n  \"exitCode\": 0,\n  \"stdout\": \" D .agent-queue/done/launch-paint-subagent-20260502.json\\n D .agent-queue/done/smoke-screenshot-20260502.json\\n D .agent-queue/reports/launch-paint-subagent-20260502.md\\n D .agent-queue/reports/smoke-screenshot-20260502.md\\n D screenshot.png\\n?? docs/scripts-guide.md\\n\",\n  \"stderr\": \"\",\n  \"durationMs\": 90,\n  \"timedOut\": false,\n  \"command\": \"git\",\n  \"args\": [\n    \"status\",\n    \"--short\"\n  ],\n  \"cwd\": \"C:\\\\Users\\\\user\\\\Documents\\\\trash\\\\Program\\\\2026-05\\\\01.05\\\\mcp-gpt-auto\"\n}"
    }
  ]
}
```
### git.diff
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"ok\": true,\n  \"exitCode\": 0,\n  \"stdout\": \" .../done/launch-paint-subagent-20260502.json       |  17 ----------\\n .agent-queue/done/smoke-screenshot-20260502.json   |  17 ----------\\n .../reports/launch-paint-subagent-20260502.md      |  19 -----------\\n .agent-queue/reports/smoke-screenshot-20260502.md  |  35 ---------------------\\n screenshot.png                                     | Bin 179437 -> 0 bytes\\n 5 files changed, 88 deletions(-)\\n\",\n  \"stderr\": \"\",\n  \"durationMs\": 88,\n  \"timedOut\": false,\n  \"command\": \"git\",\n  \"args\": [\n    \"diff\",\n    \"--stat\"\n  ],\n  \"cwd\": \"C:\\\\Users\\\\user\\\\Documents\\\\trash\\\\Program\\\\2026-05\\\\01.05\\\\mcp-gpt-auto\"\n}"
    }
  ]
}
```
### desktop.screenshot
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"analysis\": {\n    \"error\": \"metadata only; open publish.commit_raw_url as an image and set analysis.ok=true only after visual inspection\",\n    \"image_loaded\": false,\n    \"loaded_from\": null,\n    \"ok\": false\n  },\n  \"capture\": {\n    \"checks\": {\n      \"color_variation_plausible\": true,\n      \"exists\": true,\n      \"height_plausible\": true,\n      \"size_gt_min\": true,\n      \"width_plausible\": true\n    },\n    \"height\": 1440,\n    \"latest_path\": \"screenshots/latest-screenshot.png\",\n    \"ok\": true,\n    \"sampled_unique_colors\": 200,\n    \"sha256\": \"dc5f52efde1818c089fbc5e66ddb09b9b120f4d297bfe480e97f4e53dea65ce3\",\n    \"size_bytes\": 502186,\n    \"unique_path\": \"screenshots/capture-20260502-093912-dc5f52ef.png\",\n    \"width\": 2560\n  },\n  \"freshness\": {\n    \"captured_at\": \"2026-05-02T09:39:12Z\",\n    \"is_latest\": true,\n    \"previous_sha256\": \"c5a3ce7c169140f368e81a5fa2b136acd8f25f6bfc1016d1c35880e087871ed6\",\n    \"sha256_changed\": true,\n    \"warning\": null\n  },\n  \"mode\": \"capture_and_publish\",\n  \"publish\": {\n    \"commit_raw_url\": \"https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/4d78295c56515c2993e071069a1c1e4a7b78d9dd/screenshots/capture-20260502-093912-dc5f52ef.png\",\n    \"commit_sha\": \"4d78295c56515c2993e071069a1c1e4a7b78d9dd\",\n    \"commit_stderr\": \"\",\n    \"commit_stdout\": \"[main 4d78295] Update screenshot capture dc5f52ef\\n 2 files changed, 0 insertions(+), 0 deletions(-)\\n create mode 100644 screenshots/capture-20260502-093912-dc5f52ef.png\",\n    \"latest_commit_raw_url\": \"https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/4d78295c56515c2993e071069a1c1e4a7b78d9dd/screenshots/latest-screenshot.png\",\n    \"latest_main_raw_url\": \"https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/main/screenshots/latest-screenshot.png\",\n    \"ok\": true,\n    \"push_stderr\": \"To https://github.com/FokusNIK9/mcp-gpt-auto.git\\n   0e4c968..4d78295  main -> main\",\n    \"push_stdout\": \"\",\n    \"pushed_branch\": \"main\",\n    \"status_before\": [\n      \" D .agent-queue/done/launch-paint-subagent-20260502.json\",\n      \" D .agent-queue/done/smoke-screenshot-20260502.json\",\n      \" D .agent-queue/reports/launch-paint-subagent-20260502.md\",\n      \" D .agent-queue/reports/smoke-screenshot-20260502.md\",\n      \" D screenshot.png\",\n      \" M screenshots/latest-screenshot.png\",\n      \"?? docs/scripts-guide.md\",\n      \"?? screenshots/capture-20260502-093912-dc5f52ef.png\"\n    ],\n    \"unique_main_raw_url\": \"https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/main/screenshots/capture-20260502-093912-dc5f52ef.png\",\n    \"unrelated_changes_ignored\": [\n      \" D .agent-queue/done/launch-paint-subagent-20260502.json\",\n      \" D .agent-queue/done/smoke-screenshot-20260502.json\",\n      \" D .agent-queue/reports/launch-paint-subagent-20260502.md\",\n      \" D .agent-queue/reports/smoke-screenshot-20260502.md\",\n      \" D screenshot.png\",\n      \"?? docs/scripts-guide.md\"\n    ]\n  }\n}"
    }
  ]
}
```
### review.run
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"status\": \"approved\",\n  \"summary\": \"Review for smoke-test. Issues found: 0\",\n  \"diffReviewed\": true,\n  \"tests\": {\n    \"build\": \"skipped\"\n  },\n  \"issues\": [],\n  \"decision\": \"commit\"\n}"
    }
  ]
}
```
