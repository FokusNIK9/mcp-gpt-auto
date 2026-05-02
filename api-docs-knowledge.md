# Reference Documentation: mcp-gpt-auto API

## ⚡ Workspace API (Synchronous)
Used for immediate file and command operations.

### File Operations
- **writeFile**: Write text content. Args: `path`, `content`.
- **readFile**: Read text file. Args: `path`, `maxLines` (optional).
- **patchFile**: Find and replace. Args: `path`, `search`, `replace`.
- **listDir**: Directory listing. Args: `path`.
- **getTree**: Recursive tree. Args: `path`, `depth`.
- **searchFiles**: Text search. Args: `pattern`, `path`, `glob`, `maxResults`.

### Command Execution
- **execCommand**: Single command execution. Args: `command`, `args[]`, `cwd`, `input`, `timeoutMs`.
- **runScript**: Execute multi-line script. Args: `scriptContent`, `scriptType` (ps1, bat, sh, py, js), `cwd`, `timeoutMs`.
- **getScriptLog**: Fetch full log of a previous runScript. Args: `logId`.

## 📋 Task Queue (Asynchronous)
Used for background tasks.
- **queueTask**: (POST /tasks) Submit a background task.
- **getTaskStatus**: (GET /tasks/{taskId}) Check status (inbox, running, done, failed).
- **getTaskReport**: (GET /tasks/{taskId}/report) Read final Markdown report.
- **listTaskReports**: (GET /reports) List available reports.
- **getDashboard**: (GET /dashboard) Statistics and all-task overview.

## 🔗 GitHub API Action
- **getFileContents**: owner, repo, path.
- **createOrUpdateFile**: owner, repo, path, message, content (base64), sha.
- **listCommits** / **getCommit**.
- **listPullRequests** / **getPullRequestFiles**.
- **getRepoTree**: tree_sha="main".
- **compareCommits**: basehead="main...feature".

## 🔧 Method Selection Guide
- Read/Write file -> **Workspace API**
- Simple command (git status) -> **execCommand**
- Complex script -> **runScript**
- Background task (Gemini subagent, long build) -> **queueTask**
