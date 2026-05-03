/**
 * GitHub Issues integration — poll issues with specific labels
 * and auto-create tasks from them.
 *
 * Label: "agent-task" on an issue → auto-creates a task in .agent-queue/inbox/
 * When task completes → posts comment on the issue with result
 */

import fs from "node:fs/promises";
import path from "node:path";
import { TaskFile, TaskType } from "./task-types.js";
import { inboxDir, runningDir, doneDir, failedDir, reportsDir } from "../gateway/config.js";

const AGENT_LABEL = "agent-task";
const PROCESSED_FILE = ".agent-queue/.issues-processed.json";

interface GitHubIssue {
	number: number;
	title: string;
	body: string;
	labels: Array<{ name: string }>;
	state: string;
	created_at: string;
	user: { login: string };
}

interface ProcessedIssues {
	processed: number[];
	lastChecked: string;
}

async function getProcessedIssues(root: string): Promise<ProcessedIssues> {
	const filePath = path.join(root, PROCESSED_FILE);
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch {
		return { processed: [], lastChecked: "" };
	}
}

async function saveProcessedIssues(root: string, data: ProcessedIssues): Promise<void> {
	const filePath = path.join(root, PROCESSED_FILE);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Infer task type from issue labels or body content.
 */
function inferTaskType(issue: GitHubIssue): TaskType {
	const labels = issue.labels.map(l => l.name.toLowerCase());
	const body = (issue.body || "").toLowerCase();

	if (labels.includes("review") || body.includes("[type: review]")) return "review";
	if (labels.includes("gemini") || body.includes("[type: gemini]")) return "gemini";
	if (labels.includes("shell") || body.includes("[type: shell]")) return "shell";
	if (labels.includes("smoke-test") || body.includes("[type: mcp-smoke]")) return "mcp-smoke";

	// Default: if has code blocks with commands, treat as shell
	if (body.includes("```bash") || body.includes("```sh")) return "shell";

	return "gemini"; // Default to AI-driven task
}

/**
 * Parse shell commands from issue body (from ```bash blocks).
 */
function parseCommands(body: string): Array<{ command: string; args: string[] }> {
	const commands: Array<{ command: string; args: string[] }> = [];
	const codeBlocks = body.match(/```(?:bash|sh)\n([\s\S]*?)```/g);

	if (codeBlocks) {
		for (const block of codeBlocks) {
			const code = block.replace(/```(?:bash|sh)\n/, "").replace(/```$/, "").trim();
			for (const line of code.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const parts = trimmed.split(/\s+/);
				commands.push({ command: parts[0], args: parts.slice(1) });
			}
		}
	}

	return commands;
}

/**
 * Parse tags from issue labels (excluding system labels).
 */
function parseTags(issue: GitHubIssue): string[] {
	const systemLabels = new Set([AGENT_LABEL, "review", "gemini", "shell", "smoke-test"]);
	return issue.labels
		.map(l => l.name)
		.filter(l => !systemLabels.has(l.toLowerCase()));
}

/**
 * Convert a GitHub issue to a task file.
 */
export function issueToTask(issue: GitHubIssue): TaskFile {
	const taskType = inferTaskType(issue);
	const commands = taskType === "shell" ? parseCommands(issue.body || "") : undefined;

	return {
		taskId: `issue-${issue.number}`,
		title: issue.title,
		createdAt: issue.created_at,
		createdBy: `github:${issue.user.login}`,
		type: taskType,
		priority: "normal",
		workspace: ".",
		allowedFiles: [],
		instructions: issue.body || issue.title,
		commands,
		requiresPush: true,
		tags: parseTags(issue),
		sourceIssue: issue.number,
	};
}

/**
 * Fetch issues with the agent-task label from GitHub API.
 * Uses GITHUB_TOKEN for auth.
 */
export async function fetchAgentIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		console.log("[Issues] GITHUB_TOKEN not set, skipping issue sync");
		return [];
	}

	const url = `https://api.github.com/repos/${owner}/${repo}/issues?labels=${AGENT_LABEL}&state=open&per_page=20`;

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});

		if (!response.ok) {
			console.error(`[Issues] GitHub API error: ${response.status} ${response.statusText}`);
			return [];
		}

		return await response.json() as GitHubIssue[];
	} catch (err: any) {
		console.error(`[Issues] Failed to fetch issues: ${err.message}`);
		return [];
	}
}

/**
 * Post a comment on a GitHub issue.
 */
export async function commentOnIssue(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
	const token = process.env.GITHUB_TOKEN;
	if (!token) return;

	const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

	try {
		await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"Content-Type": "application/json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			body: JSON.stringify({ body }),
		});
	} catch (err: any) {
		console.error(`[Issues] Failed to post comment on #${issueNumber}: ${err.message}`);
	}
}

/**
 * Sync GitHub issues → task queue.
 * Returns number of new tasks created.
 */
export async function syncIssuesToTasks(root: string, owner: string, repo: string): Promise<number> {
	const issues = await fetchAgentIssues(owner, repo);
	if (issues.length === 0) return 0;

	const processed = await getProcessedIssues(root);
	let created = 0;

	for (const issue of issues) {
		if (processed.processed.includes(issue.number)) continue;

		// Check if task already exists in any queue directory
		const taskId = `issue-${issue.number}`;
		const exists = await Promise.any([
			fs.stat(path.join(inboxDir, `${taskId}.json`)),
			fs.stat(path.join(runningDir, `${taskId}.json`)),
			fs.stat(path.join(doneDir, `${taskId}.json`)),
			fs.stat(path.join(failedDir, `${taskId}.json`)),
		]).catch(() => null);

		if (exists) {
			processed.processed.push(issue.number);
			continue;
		}

		const task = issueToTask(issue);
		await fs.mkdir(inboxDir, { recursive: true });
		await fs.writeFile(path.join(inboxDir, `${taskId}.json`), JSON.stringify(task, null, 2));

		processed.processed.push(issue.number);
		created++;

		console.log(`[Issues] Created task from issue #${issue.number}: ${issue.title}`);

		// Post acknowledgment comment
		await commentOnIssue(owner, repo, issue.number, 
			`🤖 **Agent acknowledged** — task \`${taskId}\` created in queue.\n\nI'll post results here when complete.`
		);
	}

	processed.lastChecked = new Date().toISOString();
	await saveProcessedIssues(root, processed);

	return created;
}

/**
 * Report task completion back to the GitHub issue.
 */
export async function reportTaskToIssue(
	owner: string,
	repo: string,
	issueNumber: number,
	result: { status: string; summary: string; reportPath?: string }
): Promise<void> {
	const emoji = result.status === "done" ? "✅" : "❌";
	let body = `${emoji} **Task ${result.status}**\n\n${result.summary}`;

	if (result.reportPath) {
		body += `\n\n📄 Full report: \`${result.reportPath}\``;
	}

	await commentOnIssue(owner, repo, issueNumber, body);
}
