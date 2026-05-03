export type TaskType = "shell" | "gemini" | "review" | "mcp-smoke" | "custom";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskStatus = "planned" | "running" | "done" | "failed" | "blocked" | "retrying";

export interface TaskCommand {
  command: string;
  args: string[];
}

export interface RetryPolicy {
  /** Max number of retry attempts (default: 0 = no retry) */
  maxAttempts: number;
  /** Initial delay in ms before first retry (default: 5000) */
  initialDelayMs: number;
  /** Backoff multiplier (default: 2 for exponential) */
  backoffMultiplier: number;
  /** Max delay between retries in ms (default: 300000 = 5min) */
  maxDelayMs: number;
}

export interface TaskDependency {
  /** Task ID that must complete before this task can run */
  taskId: string;
  /** Required status of the dependency (default: "done") */
  requiredStatus?: "done" | "any";
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
  /** Task dependencies — this task won't run until all deps are satisfied */
  dependsOn?: TaskDependency[];
  /** Retry policy for automatic retries on failure */
  retry?: RetryPolicy;
  /** Tags for filtering and categorization */
  tags?: string[];
  /** GitHub Issue number that triggered this task */
  sourceIssue?: number;
  /** Estimated duration in seconds (helps with scheduling) */
  estimatedDurationSec?: number;
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
  /** Retry attempt number (0-based) */
  attempt?: number;
  /** Duration in milliseconds */
  durationMs?: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 5000,
  backoffMultiplier: 2,
  maxDelayMs: 300000,
};
