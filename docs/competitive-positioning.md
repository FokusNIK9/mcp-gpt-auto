# Competitive Positioning: mcp-gpt-auto

## One-line description

**mcp-gpt-auto** is the first open-source orchestrator that turns a regular ChatGPT Plus subscription into a full local dev agent, using GitHub as a reliable async task transport and MCP as the execution protocol.

## What makes this unique

The project combines three capabilities that no other open-source tool does simultaneously:

1. **MCP Gateway** — standard MCP tools (fs, shell, git, desktop, review, subagents)
2. **Action Bridge** — HTTP/REST with auto-generated OpenAPI for ChatGPT Custom GPT Actions
3. **GitHub Task Queue** — async task transport that survives any timeout

The **GitHub-as-queue-transport** pattern is the defensible value. No other project uses git as a task queue transport, and it solves the critical 30-second timeout problem that affects all ChatGPT Custom GPT Actions.

## Competitive Landscape

### Direct Competitors

| Project | What it does | Overlap with us |
|---|---|---|
| **Serena + mcpo + cloudflared** | Semantic IDE via LSP + MCP-to-OpenAPI proxy | 80% tool overlap, no async queue |
| **CoDeveloper GPT Engine** | Java-based Custom GPT Action server for local files | Similar idea, no MCP, no queue, sync only |
| **FileSystem-MCP-for-GPT** | Python MCP server for ChatGPT Developer Mode | Different transport (Developer Mode MCP) |

### Gateway / Infrastructure

| Project | Role | Integration potential |
|---|---|---|
| **mcpo** (4K+ stars) | MCP-to-OpenAPI proxy (Python) | Alternative approach; we do this natively in TypeScript |
| **MCPJungle** (1K stars) | Self-hosted MCP Gateway (Go) | Could use as a registry layer |
| **FastMCP** | Bidirectional MCP-OpenAPI bridge | Reference architecture |

### Task Queue Tools

| Project | Role | Overlap |
|---|---|---|
| **block/agent-task-queue** | MCP-based SQLite task queue | Solves same timeout problem, but via MCP not GitHub |
| **taskqueue-mcp** | Structured task queue for agents | Could complement our inbox format |

### Full Agent Platforms (not direct competitors)

- **OpenHands** — open-source coding agent, runs its own SDK
- **ChatGPT Agent/Operator** — OpenAI's cloud-only agent
- **GitHub Agentic Workflows** — CI/CD for AI agents

## Our Advantages

1. **No API keys needed** — works with $20/mo ChatGPT Plus subscription
2. **Survives timeouts** — GitHub queue pattern means tasks complete even if tunnel drops
3. **Full audit trail** — every task, result, and report is versioned in git
4. **Cross-platform** — Windows, Linux, macOS support
5. **MCP-native** — compatible with Claude Desktop, Cursor, and any MCP client
6. **Auto-generated OpenAPI** — adding an MCP tool automatically creates the REST endpoint
7. **Your machine, your data** — nothing runs in the cloud

## Integration Roadmap

| Priority | Integration | Status |
|---|---|---|
| P1 | Auto-OpenAPI from MCP tools | Done |
| P2 | Cross-platform desktop tools | Done |
| P3 | Cloudflare Tunnel support | Documented |
| P4 | Serena LSP integration (as subagent) | Planned |
| P5 | OAuth support (replace API key auth) | Planned |
| P6 | taskqueue-mcp format compatibility | Planned |
