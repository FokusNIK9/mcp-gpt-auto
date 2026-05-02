# MCP Inspector Smoke Test Report

Generated: 2026-05-02T07:48:35.427Z

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
      "text": "{\n  \"ok\": true,\n  \"path\": \"\",\n  \"entries\": [\n    {\n      \"name\": \".agent\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".agent-queue\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".agent-workspace\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".env\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \".git\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".gitignore\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"action-promt2.txt\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"addons\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"api-docs-knowledge.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"dist\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"docs\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"examples\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"Launcher.ps1\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"local-screenshot\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"local-screenshot.skill\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"logs\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"main-plan.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"node_modules\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"openapi\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"package-lock.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"package.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"README.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"schemas\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"screenshot.png\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"screenshots\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"scripts\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"src\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"tsconfig.json\",\n      \"isDirectory\": false\n    }\n  ]\n}"
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
      "text": "{\n  \"ok\": true,\n  \"path\": \"\",\n  \"tree\": [\n    {\n      \"name\": \".agent\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"artifacts\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"logs\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"policy.example.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"tasks\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \".agent-queue\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"done\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"failed\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"inbox\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"README.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"reports\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"running\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \".agent-workspace\",\n      \"isDirectory\": true,\n      \"children\": []\n    },\n    {\n      \"name\": \".env\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \".gitignore\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"action-promt2.txt\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"addons\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"firefox-action-confirm\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"api-docs-knowledge.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"dist\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"action-bridge\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"gateway\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"index.js\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"runner\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"servers\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"docs\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"agentic-mcp-plan.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"github-task-runner.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"gpt-action-bridge.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"mcp-inspector-smoke-test.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"security-redaction.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"subagent-contract.md\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"examples\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"gemini-task.prompt.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"github-task.example.json\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"Launcher.ps1\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"local-screenshot\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"assets\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"references\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"scripts\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"SKILL.md\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"local-screenshot.skill\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"logs\",\n      \"isDirectory\": true,\n      \"children\": []\n    },\n    {\n      \"name\": \"main-plan.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"openapi\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"gpt-action-bridge.openapi.yaml\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"package-lock.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"package.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"README.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"schemas\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"review-result.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"subagent-result.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"task.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"tool-result.schema.json\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"screenshot.png\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"screenshots\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"capture-20260502-071313-bbe82e7e.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-071418-a66ac1ad.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-071754-95c47250.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-072136-e667eae9.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-072206-f9afd161.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-072320-71418255.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-074030-7df7a7ce.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-074553-6a0dc9af.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"capture-20260502-074702-5a875e06.png\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"latest-screenshot.png\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"scripts\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"smoke-test.js\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"test-redaction.js\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"win\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"src\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"action-bridge\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"gateway\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"index.ts\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"runner\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"servers\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"tsconfig.json\",\n      \"isDirectory\": false\n    }\n  ]\n}"
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
      "text": "{\n  \"ok\": true,\n  \"exitCode\": 0,\n  \"stdout\": \" D action-promt.txt\\n M docs/mcp-inspector-smoke-test.md\\n?? action-promt2.txt\\n?? screenshot.png\\n\",\n  \"stderr\": \"\",\n  \"durationMs\": 113,\n  \"timedOut\": false,\n  \"command\": \"git\",\n  \"args\": [\n    \"status\",\n    \"--short\"\n  ],\n  \"cwd\": \"C:\\\\Users\\\\user\\\\Documents\\\\trash\\\\Program\\\\2026-05\\\\01.05\\\\mcp-gpt-auto\"\n}"
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
      "text": "{\n  \"ok\": true,\n  \"exitCode\": 0,\n  \"stdout\": \" action-promt.txt                 | 20 --------------------\\n docs/mcp-inspector-smoke-test.md | 14 +++++++-------\\n 2 files changed, 7 insertions(+), 27 deletions(-)\\n\",\n  \"stderr\": \"warning: in the working copy of 'docs/mcp-inspector-smoke-test.md', LF will be replaced by CRLF the next time Git touches it\\n\",\n  \"durationMs\": 91,\n  \"timedOut\": false,\n  \"command\": \"git\",\n  \"args\": [\n    \"diff\",\n    \"--stat\"\n  ],\n  \"cwd\": \"C:\\\\Users\\\\user\\\\Documents\\\\trash\\\\Program\\\\2026-05\\\\01.05\\\\mcp-gpt-auto\"\n}"
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
      "text": "{\n  \"analysis\": {\n    \"error\": \"metadata only; open publish.commit_raw_url as an image and set analysis.ok=true only after visual inspection\",\n    \"image_loaded\": false,\n    \"loaded_from\": null,\n    \"ok\": false\n  },\n  \"capture\": {\n    \"checks\": {\n      \"color_variation_plausible\": true,\n      \"exists\": true,\n      \"height_plausible\": true,\n      \"size_gt_min\": true,\n      \"width_plausible\": true\n    },\n    \"height\": 1440,\n    \"latest_path\": \"screenshots/latest-screenshot.png\",\n    \"ok\": true,\n    \"sampled_unique_colors\": 200,\n    \"sha256\": \"857efa6938e6f574656ec29283e9351f2100ed63bc40d2e6de1b7dfe2d15bb17\",\n    \"size_bytes\": 502170,\n    \"unique_path\": \"screenshots/capture-20260502-074831-857efa69.png\",\n    \"width\": 2560\n  },\n  \"freshness\": {\n    \"captured_at\": \"2026-05-02T07:48:31Z\",\n    \"is_latest\": true,\n    \"previous_sha256\": \"5a875e06d7357b9a932d035b3a4895fa75f5582daab72e993ad82d29e4dd8906\",\n    \"sha256_changed\": true,\n    \"warning\": null\n  },\n  \"mode\": \"capture_and_publish\",\n  \"publish\": {\n    \"commit_raw_url\": \"https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/46499c601c2f82485c07ee01a52bd97ab48052ad/screenshots/capture-20260502-074831-857efa69.png\",\n    \"commit_sha\": \"46499c601c2f82485c07ee01a52bd97ab48052ad\",\n    \"commit_stderr\": \"\",\n    \"commit_stdout\": \"[main 46499c6] Update screenshot capture 857efa69\\n 2 files changed, 0 insertions(+), 0 deletions(-)\\n create mode 100644 screenshots/capture-20260502-074831-857efa69.png\",\n    \"latest_commit_raw_url\": \"https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/46499c601c2f82485c07ee01a52bd97ab48052ad/screenshots/latest-screenshot.png\",\n    \"latest_main_raw_url\": \"https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/main/screenshots/latest-screenshot.png\",\n    \"ok\": true,\n    \"push_stderr\": \"To https://github.com/FokusNIK9/mcp-gpt-auto.git\\n   a9c36cb..46499c6  main -> main\",\n    \"push_stdout\": \"\",\n    \"pushed_branch\": \"main\",\n    \"status_before\": [\n      \" D action-promt.txt\",\n      \" M docs/mcp-inspector-smoke-test.md\",\n      \" M screenshots/latest-screenshot.png\",\n      \"?? action-promt2.txt\",\n      \"?? screenshot.png\",\n      \"?? screenshots/capture-20260502-074831-857efa69.png\"\n    ],\n    \"unique_main_raw_url\": \"https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/main/screenshots/capture-20260502-074831-857efa69.png\",\n    \"unrelated_changes_ignored\": [\n      \" D action-promt.txt\",\n      \" M docs/mcp-inspector-smoke-test.md\",\n      \"?? action-promt2.txt\",\n      \"?? screenshot.png\"\n    ]\n  }\n}"
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
      "text": "{\n  \"status\": \"rejected\",\n  \"summary\": \"Review for smoke-test. Issues found: 2\",\n  \"diffReviewed\": true,\n  \"tests\": {\n    \"build\": \"skipped\"\n  },\n  \"issues\": [\n    {\n      \"severity\": \"critical\",\n      \"message\": \"Potential secret found: secret\"\n    },\n    {\n      \"severity\": \"critical\",\n      \"message\": \"Potential secret found: .env\"\n    }\n  ],\n  \"decision\": \"ask_user\"\n}"
    }
  ]
}
```
