# MCP Inspector Smoke Test Report

Generated: 2026-05-01T00:31:28.065Z

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
      "text": "{\n  \"ok\": true,\n  \"path\": \"\",\n  \"entries\": [\n    {\n      \"name\": \".agent\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".git\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \".gitignore\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"dist\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"docs\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"examples\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"node_modules\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"package-lock.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"package.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"README.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"schemas\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"scripts\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"src\",\n      \"isDirectory\": true\n    },\n    {\n      \"name\": \"text.txt\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"tsconfig.json\",\n      \"isDirectory\": false\n    }\n  ]\n}"
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
      "text": "{\n  \"ok\": true,\n  \"path\": \"\",\n  \"tree\": [\n    {\n      \"name\": \".agent\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"logs\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"policy.example.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"tasks\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \".gitignore\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"dist\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"gateway\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"index.js\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"servers\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"docs\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"agentic-mcp-plan.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"mcp-inspector-smoke-test.md\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"subagent-contract.md\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"examples\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"gemini-task.prompt.md\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"package-lock.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"package.json\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"README.md\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"schemas\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"review-result.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"subagent-result.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"task.schema.json\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"tool-result.schema.json\",\n          \"isDirectory\": false\n        }\n      ]\n    },\n    {\n      \"name\": \"scripts\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"smoke-test.js\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"win\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"src\",\n      \"isDirectory\": true,\n      \"children\": [\n        {\n          \"name\": \"gateway\",\n          \"isDirectory\": true,\n          \"children\": null\n        },\n        {\n          \"name\": \"index.ts\",\n          \"isDirectory\": false\n        },\n        {\n          \"name\": \"servers\",\n          \"isDirectory\": true,\n          \"children\": null\n        }\n      ]\n    },\n    {\n      \"name\": \"text.txt\",\n      \"isDirectory\": false\n    },\n    {\n      \"name\": \"tsconfig.json\",\n      \"isDirectory\": false\n    }\n  ]\n}"
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
      "text": "{\n  \"ok\": true,\n  \"exitCode\": 0,\n  \"stdout\": \"?? docs/mcp-inspector-smoke-test.md\\n?? package-lock.json\\n?? scripts/smoke-test.js\\n\",\n  \"stderr\": \"\",\n  \"durationMs\": 50,\n  \"timedOut\": false,\n  \"command\": \"git\",\n  \"args\": [\n    \"status\",\n    \"--short\"\n  ],\n  \"cwd\": \"C:\\\\Users\\\\user\\\\Documents\\\\trash\\\\Program\\\\2026-05\\\\01.05\\\\mcp-gpt-auto\"\n}"
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
      "text": "{\n  \"ok\": true,\n  \"exitCode\": 0,\n  \"stdout\": \"\",\n  \"stderr\": \"\",\n  \"durationMs\": 46,\n  \"timedOut\": false,\n  \"command\": \"git\",\n  \"args\": [\n    \"diff\",\n    \"--stat\"\n  ],\n  \"cwd\": \"C:\\\\Users\\\\user\\\\Documents\\\\trash\\\\Program\\\\2026-05\\\\01.05\\\\mcp-gpt-auto\"\n}"
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
      "text": "{\n  \"ok\": true,\n  \"path\": \".agent/artifacts/screenshots/2026-05-01T00-31-27-563Z.png\",\n  \"error\": \"\"\n}"
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
