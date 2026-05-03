import { z } from "zod";

export const CommandSchema = z.object({
  command: z.enum([
    "git",
    "node",
    "npm",
    "pnpm",
    "dotnet",
    "python",
    "py",
    "gemini",
    "powershell",
    "pwsh",
    "cmd"
  ]),
  args: z.array(z.string())
}).strict();

export const QueueTaskRequestSchema = z.object({
  taskId: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  title: z.string(),
  type: z.enum(["shell", "gemini", "review", "mcp-smoke"]),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  instructions: z.string(),
  commands: z.array(CommandSchema).default([]),
  allowedFiles: z.array(z.string()).default([
    "README.md",
    "docs/**",
    "scripts/**",
    "src/**",
    ".agent-queue/**",
    "package.json",
    "package-lock.json",
    "tsconfig.json"
  ]),
  requiresPush: z.boolean().default(true)
}).strict();

export type Command = z.infer<typeof CommandSchema>;
export type QueueTaskRequest = z.infer<typeof QueueTaskRequestSchema>;
