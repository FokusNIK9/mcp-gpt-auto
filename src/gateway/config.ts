import path from "node:path";

export const root = path.resolve(process.env.MCP_GPT_AUTO_WORKSPACE ?? process.cwd());
export const agent = path.join(root, ".agent");

// Queue directories
export const queueDir = path.join(root, ".agent-queue");
export const inboxDir = path.join(queueDir, "inbox");
export const runningDir = path.join(queueDir, "running");
export const doneDir = path.join(queueDir, "done");
export const failedDir = path.join(queueDir, "failed");
export const reportsDir = path.join(queueDir, "reports");

export const allowed = ["git", "node", "npm", "pnpm", "dotnet", "python", "py", "gemini", "powershell", "pwsh", "cmd", "bash"];
export const blocked = [".env", ".ssh", "AppData", "id_rsa", "id_ed25519"];
