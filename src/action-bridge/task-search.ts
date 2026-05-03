/**
 * Task history search and filtering API.
 * Provides endpoints for querying completed/failed tasks with filters.
 */

import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { inboxDir, runningDir, doneDir, failedDir, reportsDir } from "../gateway/config.js";
import { redactText } from "../gateway/redact.js";

interface TaskSearchParams {
	/** Filter by task status */
	status?: "inbox" | "running" | "done" | "failed" | "all";
	/** Filter by task type */
	type?: string;
	/** Filter by tag */
	tag?: string;
	/** Search in title/instructions */
	query?: string;
	/** Pagination */
	limit?: number;
	offset?: number;
	/** Sort field */
	sortBy?: "createdAt" | "modifiedAt" | "priority";
	/** Sort direction */
	sortOrder?: "asc" | "desc";
	/** Date range filter (ISO strings) */
	since?: string;
	until?: string;
}

interface TaskSearchResult {
	taskId: string;
	title: string;
	type: string;
	status: string;
	priority: string;
	createdAt: string;
	modifiedAt: string;
	tags?: string[];
	hasReport: boolean;
	summary?: string;
}

async function loadTasksFromDir(dir: string, status: string): Promise<TaskSearchResult[]> {
	const results: TaskSearchResult[] = [];
	try {
		const files = await fs.readdir(dir);
		for (const file of files) {
			if (!file.endsWith(".json") || file.endsWith(".lock") || file.endsWith(".retry.json")) continue;
			try {
				const content = await fs.readFile(path.join(dir, file), "utf8");
				const data = JSON.parse(content);
				const stats = await fs.stat(path.join(dir, file));
				const taskId = data.taskId || path.basename(file, ".json");
				const reportPath = path.join(reportsDir, `${taskId}.md`);
				const hasReport = !!(await fs.stat(reportPath).catch(() => null));

				results.push({
					taskId,
					title: data.title || "",
					type: data.type || "unknown",
					status,
					priority: data.priority || "normal",
					createdAt: data.createdAt || stats.birthtime.toISOString(),
					modifiedAt: stats.mtime.toISOString(),
					tags: data.tags || [],
					hasReport,
					summary: data.summary || "",
				});
			} catch { /* skip malformed files */ }
		}
	} catch { /* dir might not exist */ }
	return results;
}

function matchesFilter(task: TaskSearchResult, params: TaskSearchParams): boolean {
	if (params.type && task.type !== params.type) return false;
	if (params.tag && (!task.tags || !task.tags.includes(params.tag))) return false;
	if (params.query) {
		const q = params.query.toLowerCase();
		const searchable = `${task.title} ${task.taskId} ${task.summary || ""}`.toLowerCase();
		if (!searchable.includes(q)) return false;
	}
	if (params.since && task.createdAt < params.since) return false;
	if (params.until && task.createdAt > params.until) return false;
	return true;
}

export function registerTaskSearchRoutes(app: express.Application): void {
	/**
	 * GET /tasks/search?status=all&type=shell&tag=deploy&query=test&limit=20&offset=0
	 */
	app.get("/tasks/search", async (req, res) => {
		const params: TaskSearchParams = {
			status: (req.query.status as TaskSearchParams["status"]) || "all",
			type: req.query.type as string,
			tag: req.query.tag as string,
			query: req.query.query as string,
			limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
			offset: parseInt(req.query.offset as string) || 0,
			sortBy: (req.query.sortBy as any) || "createdAt",
			sortOrder: (req.query.sortOrder as any) || "desc",
			since: req.query.since as string,
			until: req.query.until as string,
		};

		let allTasks: TaskSearchResult[] = [];

		const statusDirs: Record<string, string> = {
			inbox: inboxDir,
			running: runningDir,
			done: doneDir,
			failed: failedDir,
		};

		if (params.status === "all") {
			for (const [status, dir] of Object.entries(statusDirs)) {
				allTasks.push(...await loadTasksFromDir(dir, status));
			}
		} else if (statusDirs[params.status!]) {
			allTasks = await loadTasksFromDir(statusDirs[params.status!], params.status!);
		}

		// Apply filters
		let filtered = allTasks.filter(t => matchesFilter(t, params));

		// Sort
		const sortOrder = params.sortOrder === "asc" ? 1 : -1;
		filtered.sort((a, b) => {
			if (params.sortBy === "priority") {
				const po = { critical: 0, high: 1, normal: 2, low: 3 };
				return (((po as any)[a.priority] ?? 2) - ((po as any)[b.priority] ?? 2)) * sortOrder;
			}
			const aVal = (a as any)[params.sortBy!] || "";
			const bVal = (b as any)[params.sortBy!] || "";
			return aVal.localeCompare(bVal) * sortOrder;
		});

		const total = filtered.length;
		const paginated = filtered.slice(params.offset!, params.offset! + params.limit!);

		res.json({
			ok: true,
			total,
			offset: params.offset,
			limit: params.limit,
			tasks: paginated,
		});
	});

	/**
	 * GET /tasks/stats — aggregate statistics about all tasks
	 */
	app.get("/tasks/stats", async (req, res) => {
		const counts: Record<string, number> = { inbox: 0, running: 0, done: 0, failed: 0 };
		const typeBreakdown: Record<string, number> = {};
		const tagBreakdown: Record<string, number> = {};

		const statusDirs: Record<string, string> = {
			inbox: inboxDir,
			running: runningDir,
			done: doneDir,
			failed: failedDir,
		};

		for (const [status, dir] of Object.entries(statusDirs)) {
			try {
				const files = await fs.readdir(dir);
				const jsonFiles = files.filter(f => f.endsWith(".json") && !f.endsWith(".lock") && !f.endsWith(".retry.json"));
				counts[status] = jsonFiles.length;

				for (const file of jsonFiles) {
					try {
						const content = await fs.readFile(path.join(dir, file), "utf8");
						const data = JSON.parse(content);
						const type = data.type || "unknown";
						typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
						if (data.tags) {
							for (const tag of data.tags) {
								tagBreakdown[tag] = (tagBreakdown[tag] || 0) + 1;
							}
						}
					} catch { /* skip */ }
				}
			} catch { /* dir might not exist */ }
		}

		res.json({
			ok: true,
			total: Object.values(counts).reduce((a, b) => a + b, 0),
			byStatus: counts,
			byType: typeBreakdown,
			byTag: tagBreakdown,
		});
	});
}
