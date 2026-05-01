import path from "node:path";

export const root = path.resolve(process.env.MCP_GPT_AUTO_WORKSPACE ?? process.cwd());
export const agent = path.join(root, ".agent");
export const allowed = ["git", "node", "npm", "pnpm", "dotnet", "python", "py", "gemini", "powershell", "pwsh", "cmd"];
export const blocked = [".env", ".ssh", "AppData", "id_rsa", "id_ed25519"];
