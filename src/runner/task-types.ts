export type TaskType = "shell" | "gemini" | "review" | "mcp-smoke" | "custom";
export type TaskPriority = "low" | "normal" | "high";
export type TaskStatus = "planned" | "running" | "done" | "failed";

export interface TaskCommand {
  command: string;
  args: string[];
}

export interface TaskFile {
  taskId: string;
  title: string;
  createdAt: string;
  createdBy: string;
  type: TaskType;
  priority: TaskPriority;
  workspace: string;
  allowedFiles: string[];
  instructions: string;
  commands?: TaskCommand[];
  requiresPush?: boolean;
}

export interface TaskResult {
  taskId: string;
  status: "done" | "failed";
  startedAt: string;
  finishedAt: string;
  summary: string;
  commandsRun: Array<{
    command: string;
    exitCode: number | null;
    stdoutTail: string;
    stderrTail: string;
  }>;
  filesChanged: string[];
  reportPath: string;
  commitSha?: string;
}
