/**
 * Task progress streaming via Server-Sent Events.
 * Allows ChatGPT (via Custom GPT) to subscribe to real-time progress
 * of long-running tasks instead of polling.
 */

import express from "express";
import { EventEmitter } from "node:events";

export interface TaskProgressEvent {
	taskId: string;
	type: "started" | "progress" | "command_output" | "completed" | "failed" | "retrying";
	timestamp: string;
	data: Record<string, unknown>;
}

// Global event bus for task progress
class TaskProgressBus extends EventEmitter {
	emit(taskId: string, event: TaskProgressEvent): boolean {
		const a = super.emit(taskId, event);
		const b = super.emit("*", event);
		return a || b;
	}
}

export const progressBus = new TaskProgressBus();
progressBus.setMaxListeners(100);

/**
 * Emit a task progress event.
 */
export function emitProgress(taskId: string, type: TaskProgressEvent["type"], data: Record<string, unknown> = {}): void {
	const event: TaskProgressEvent = {
		taskId,
		type,
		timestamp: new Date().toISOString(),
		data,
	};
	progressBus.emit(taskId, event);
}

/**
 * Register SSE streaming routes for task progress.
 *
 * GET /tasks/:taskId/stream — SSE stream of progress events for a specific task
 * GET /tasks/stream — SSE stream of ALL task progress events
 */
export function registerTaskStreamRoutes(app: express.Application): void {
	// Stream progress for a specific task
	app.get("/tasks/:taskId/stream", (req, res) => {
		const { taskId } = req.params;

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
			"X-Accel-Buffering": "no",
		});

		res.write(`data: ${JSON.stringify({ type: "connected", taskId, timestamp: new Date().toISOString() })}\n\n`);

		const handler = (event: TaskProgressEvent) => {
			res.write(`data: ${JSON.stringify(event)}\n\n`);

			// Auto-close stream when task completes or fails
			if (event.type === "completed" || event.type === "failed") {
				setTimeout(() => res.end(), 100);
			}
		};

		progressBus.on(taskId, handler);

		req.on("close", () => {
			progressBus.off(taskId, handler);
		});
	});

	// Stream ALL task events (firehose)
	app.get("/tasks/stream", (req, res) => {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
			"X-Accel-Buffering": "no",
		});

		res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

		const handler = (event: TaskProgressEvent) => {
			res.write(`data: ${JSON.stringify(event)}\n\n`);
		};

		progressBus.on("*", handler);

		req.on("close", () => {
			progressBus.off("*", handler);
		});
	});
}
