/**
 * Task Scheduler with dependency resolution, retry logic, and file-based locking.
 * Inspired by taskqueue-mcp and block/agent-task-queue patterns.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { TaskFile, TaskResult, RetryPolicy, DEFAULT_RETRY_POLICY } from "./task-types.js";
import { inboxDir, runningDir, doneDir, failedDir } from "../gateway/config.js";

interface LockFile {
	runnerId: string;
	taskId: string;
	lockedAt: string;
	pid: number;
}

const LOCK_EXTENSION = ".lock";

/**
 * Acquire a file-based lock on a task. Returns true if lock acquired.
 * Prevents multiple runners from processing the same task.
 */
export async function acquireTaskLock(taskId: string, runnerId: string): Promise<boolean> {
	const lockPath = path.join(runningDir, `${taskId}${LOCK_EXTENSION}`);
	const lockData: LockFile = {
		runnerId,
		taskId,
		lockedAt: new Date().toISOString(),
		pid: process.pid,
	};

	try {
		// Use exclusive flag — fails if file already exists
		await fs.writeFile(lockPath, JSON.stringify(lockData, null, 2), { flag: "wx" });
		return true;
	} catch (err: any) {
		if (err.code === "EEXIST") {
			// Lock already held — check if it's stale (>10 minutes old)
			try {
				const existing = JSON.parse(await fs.readFile(lockPath, "utf8")) as LockFile;
				const lockAge = Date.now() - new Date(existing.lockedAt).getTime();
				if (lockAge > 10 * 60 * 1000) {
					// Stale lock — forcibly take over
					console.log(`[Scheduler] Stale lock for ${taskId} (${Math.floor(lockAge / 1000)}s old), taking over`);
					await fs.writeFile(lockPath, JSON.stringify(lockData, null, 2));
					return true;
				}
			} catch {
				// Can't read lock file — try to take it
				await fs.writeFile(lockPath, JSON.stringify(lockData, null, 2));
				return true;
			}
			return false;
		}
		throw err;
	}
}

/**
 * Release a task lock.
 */
export async function releaseTaskLock(taskId: string): Promise<void> {
	const lockPath = path.join(runningDir, `${taskId}${LOCK_EXTENSION}`);
	await fs.unlink(lockPath).catch(() => {});
}

/**
 * Check if all dependencies for a task are satisfied.
 */
export async function areDependenciesMet(task: TaskFile): Promise<{ met: boolean; blocked: string[] }> {
	if (!task.dependsOn || task.dependsOn.length === 0) {
		return { met: true, blocked: [] };
	}

	const blocked: string[] = [];

	for (const dep of task.dependsOn) {
		const requiredStatus = dep.requiredStatus || "done";

		if (requiredStatus === "done") {
			const donePath = path.join(doneDir, `${dep.taskId}.json`);
			const exists = await fs.stat(donePath).catch(() => null);
			if (!exists) {
				blocked.push(dep.taskId);
			}
		} else {
			// "any" — just needs to be finished (done or failed)
			const donePath = path.join(doneDir, `${dep.taskId}.json`);
			const failedPath = path.join(failedDir, `${dep.taskId}.json`);
			const doneExists = await fs.stat(donePath).catch(() => null);
			const failedExists = await fs.stat(failedPath).catch(() => null);
			if (!doneExists && !failedExists) {
				blocked.push(dep.taskId);
			}
		}
	}

	return { met: blocked.length === 0, blocked };
}

/**
 * Calculate retry delay using exponential backoff.
 */
export function calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
	const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt);
	return Math.min(delay, policy.maxDelayMs);
}

/**
 * Determine if a task should be retried after failure.
 */
export function shouldRetry(task: TaskFile, currentAttempt: number): boolean {
	if (!task.retry) return false;
	return currentAttempt < task.retry.maxAttempts;
}

/**
 * Get retry metadata path for tracking attempts.
 */
function retryMetaPath(taskId: string): string {
	return path.join(inboxDir, `${taskId}.retry.json`);
}

interface RetryMeta {
	taskId: string;
	attempts: number;
	lastFailedAt: string;
	nextRetryAt: string;
	errors: string[];
}

/**
 * Record a retry attempt.
 */
export async function recordRetryAttempt(taskId: string, error: string, policy: RetryPolicy): Promise<RetryMeta> {
	const metaPath = retryMetaPath(taskId);
	let meta: RetryMeta;

	try {
		meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
	} catch {
		meta = { taskId, attempts: 0, lastFailedAt: "", nextRetryAt: "", errors: [] };
	}

	meta.attempts++;
	meta.lastFailedAt = new Date().toISOString();
	meta.errors.push(error);

	const delay = calculateRetryDelay(meta.attempts - 1, policy);
	meta.nextRetryAt = new Date(Date.now() + delay).toISOString();

	await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
	return meta;
}

/**
 * Get retry metadata for a task.
 */
export async function getRetryMeta(taskId: string): Promise<RetryMeta | null> {
	const metaPath = retryMetaPath(taskId);
	try {
		return JSON.parse(await fs.readFile(metaPath, "utf8"));
	} catch {
		return null;
	}
}

/**
 * Check if a task is ready for retry (past its backoff window).
 */
export async function isReadyForRetry(taskId: string): Promise<boolean> {
	const meta = await getRetryMeta(taskId);
	if (!meta) return true;
	return Date.now() >= new Date(meta.nextRetryAt).getTime();
}

/**
 * Clean up retry metadata after task succeeds.
 */
export async function clearRetryMeta(taskId: string): Promise<void> {
	const metaPath = retryMetaPath(taskId);
	await fs.unlink(metaPath).catch(() => {});
}

/**
 * Sort tasks by priority for processing order.
 * critical > high > normal > low
 */
export function sortByPriority(tasks: TaskFile[]): TaskFile[] {
	const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
	return tasks.sort((a, b) => {
		const pa = priorityOrder[a.priority] ?? 2;
		const pb = priorityOrder[b.priority] ?? 2;
		return pa - pb;
	});
}
