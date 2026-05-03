import fs from "node:fs/promises";
import path from "node:path";
import { TaskFile, TaskResult, DEFAULT_RETRY_POLICY } from "./task-types.js";
import { run, audit, rel, taskDir } from "../gateway/utils.js";
import { root, inboxDir, runningDir, doneDir, failedDir, reportsDir } from "../gateway/config.js";
import { redactText, redactSecrets } from "../gateway/redact.js";
import {
    acquireTaskLock, releaseTaskLock, areDependenciesMet,
    shouldRetry, recordRetryAttempt, getRetryMeta, isReadyForRetry,
    clearRetryMeta, sortByPriority,
} from "./task-scheduler.js";
import { syncIssuesToTasks, reportTaskToIssue } from "./github-issues.js";

// Relay progress to bridge via HTTP (cross-process compatible)
const BRIDGE_URL = process.env.ACTION_BRIDGE_URL || "http://127.0.0.1:8787";
function emitProgress(taskId: string, type: string, data: Record<string, unknown> = {}): void {
    fetch(`${BRIDGE_URL}/api/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, type, data }),
    }).catch(() => { /* best-effort, bridge might not be running */ });
}

process.env.GIT_TERMINAL_PROMPT = "0";
process.env.GCM_INTERACTIVE = "never";

const RUNNER_ID = process.env.RUNNER_ID || `runner-${process.pid}-${Date.now()}`;

function gitAuthArgs(args: string[]) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return args;

    const remoteUrl = process.env.GITHUB_REMOTE_URL || "https://github.com/FokusNIK9/mcp-gpt-auto.git";
    const authedRemoteUrl = remoteUrl.replace("https://", `https://x-access-token:${encodeURIComponent(token)}@`);

    if (args[0] === "pull") {
        const pullOptions = args.slice(1);
        return ["pull", ...pullOptions, authedRemoteUrl, "main"];
    }

    if (args[0] === "push") {
        return ["push", authedRemoteUrl, ...args.slice(2)];
    }

    return [
        "-c",
        "credential.helper=",
        "-c",
        "core.askPass=",
        ...args
    ];
}

async function runGit(args: string[]) {
    return await run("git", gitAuthArgs(args), root) as any;
}

async function pullChanges() {
    console.log("[Runner] Pulling changes from GitHub...");
    // Use --ff-only to avoid merge conflicts in the runner
    const r = await runGit(["pull", "--ff-only"]);
    if (!r.ok) {
        console.error("[Runner] git pull failed:", redactText(r.stderr));
        return false;
    }
    return true;
}

async function pushChanges(message: string) {
    if (process.env.CONFIRM_PUSH !== "YES") {
        console.log("[Runner] Push skipped (CONFIRM_PUSH != YES)");
        return true;
    }
    
    console.log(`[Runner] Pushing changes: ${message}`);
    
    // Safety: check status and diff before pushing
    const status = await runGit(["status"]);
    const diffStat = await runGit(["diff", "--stat"]);
    
    console.log("[Runner] Git Status:\n", redactText(status.stdout));
    console.log("[Runner] Git Diff Stat:\n", redactText(diffStat.stdout));

    await runGit(["add", "."]);
    const commitR = await run("git", gitAuthArgs(["commit", "-F", "-"]), root, message) as any;
    
    if (!commitR.ok && !commitR.stdout.includes("nothing to commit")) {
        console.error("[Runner] git commit failed:", redactText(commitR.stderr));
        return false;
    }
    
    // Support for GITHUB_TOKEN to avoid interactive prompts
    const token = process.env.GITHUB_TOKEN;
    const pushArgs = ["push", "origin", "main"];
    
    if (token) {
        console.log("[Runner] Using GITHUB_TOKEN for push (value hidden)");
    }

    const pushR = await runGit(pushArgs);
    if (!pushR.ok) {
        console.error("[Runner] git push failed. Ensure credentials are configured or GITHUB_TOKEN is set.");
        return false;
    }
    
    console.log("[Runner] Push successful.");
    return true;
}

async function processTask(taskPath: string) {
    const taskId = path.basename(taskPath, ".json");
    const runningPath = path.join(runningDir, `${taskId}.json`);
    
    console.log(`[Runner:${RUNNER_ID}] Starting task: ${taskId}`);
    const content = await fs.readFile(taskPath, "utf8");
    const task = JSON.parse(content) as TaskFile;

    // Check dependencies
    const { met, blocked } = await areDependenciesMet(task);
    if (!met) {
        console.log(`[Runner] Task ${taskId} blocked on dependencies: ${blocked.join(", ")}`);
        emitProgress(taskId, "progress", { message: `Blocked on: ${blocked.join(", ")}` });
        return;
    }

    // Check retry readiness
    if (!(await isReadyForRetry(taskId))) {
        const meta = await getRetryMeta(taskId);
        console.log(`[Runner] Task ${taskId} in backoff until ${meta?.nextRetryAt}`);
        return;
    }

    // Acquire lock (multi-runner safety)
    if (!(await acquireTaskLock(taskId, RUNNER_ID))) {
        console.log(`[Runner] Task ${taskId} locked by another runner, skipping`);
        return;
    }

    // Move to running
    await fs.rename(taskPath, runningPath);
    emitProgress(taskId, "started", { runner: RUNNER_ID, type: task.type, title: task.title });
    await pushChanges(`Start task ${taskId}`);

    const startedAt = new Date().toISOString();
    const result: TaskResult = {
        taskId,
        status: "done",
        startedAt,
        finishedAt: "",
        summary: "",
        commandsRun: [],
        filesChanged: [],
        reportPath: rel(path.join(reportsDir, `${taskId}.md`))
    };

    try {
        if (task.type === "shell" && task.commands) {
            for (let i = 0; i < task.commands.length; i++) {
                const cmd = task.commands[i];
                console.log(`[Runner] Executing: ${cmd.command} ${cmd.args.join(" ")}`);
                emitProgress(taskId, "command_output", {
                    step: i + 1,
                    total: task.commands.length,
                    command: `${cmd.command} ${cmd.args.join(" ")}`,
                });
                const r = await run(cmd.command, cmd.args, root) as any;
                result.commandsRun.push({
                    command: `${cmd.command} ${cmd.args.join(" ")}`,
                    exitCode: r.exitCode,
                    stdoutTail: redactText(r.stdout.slice(-2000)),
                    stderrTail: redactText(r.stderr.slice(-2000))
                });
                if (!r.ok) {
                    result.status = "failed";
                    result.summary = `Command failed: ${cmd.command}`;
                    break;
                }
            }
        } else if (task.type === "gemini") {
            const tDir = taskDir(taskId);
            const resultDir = path.join(tDir, "result");
            await fs.mkdir(resultDir, { recursive: true });

            const prompt = [
                "# Task",
                task.instructions,
                "",
                "# Workspace",
                root,
                "",
                "# Rules",
                "You are running as an external local agent for mcp-gpt-auto.",
                "Work inside the current workspace unless the task explicitly asks for a safe local desktop action.",
                "Return a concise final status with commands run and verification."
            ].join("\n");
            const promptPath = path.join(tDir, "prompt.md");
            await fs.writeFile(promptPath, prompt);

            const geminiCmd = process.env.GEMINI_CMD || "gemini";
            console.log(`[Runner] Running Gemini flow for ${taskId} in headless prompt mode`);

            const escapedPromptPath = promptPath.replace(/'/g, "''");
            const r = process.platform === "win32"
                ? await run("powershell", [
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    `$prompt = Get-Content -Raw -LiteralPath '${escapedPromptPath}'; ${geminiCmd} --skip-trust --approval-mode yolo --prompt $prompt`
                ], root, "", 300000) as any
                : await run(geminiCmd, ["--skip-trust", "--approval-mode", "yolo", "--prompt", prompt], root, "", 300000) as any;

            // Save stdout/stderr to result dir for debugging
            if (r.stdout) await fs.writeFile(path.join(resultDir, "subagent-stdout.txt"), r.stdout).catch(() => {});
            if (r.stderr) await fs.writeFile(path.join(resultDir, "subagent-stderr.txt"), r.stderr).catch(() => {});

            result.commandsRun.push({
                command: `${geminiCmd} --skip-trust --approval-mode yolo --prompt <${taskId}>`,
                exitCode: r.exitCode,
                stdoutTail: redactText(r.stdout.slice(-2000)),
                stderrTail: redactText(r.stderr.slice(-2000))
            });
            if (!r.ok) {
                result.status = "failed";
                result.summary = `Gemini flow failed (exit ${r.exitCode})`;
            } else {
                result.summary = `Gemini subagent completed for task ${taskId}`;
            }
        } else if (task.type === "review") {
            console.log(`[Runner] Running automated review for ${taskId}`);
            const build = await run("npm", ["run", "build"], root) as any;
            
            result.summary = `Review complete. Build: ${build.ok ? "OK" : "FAILED"}`;
            result.commandsRun.push({ 
                command: "npm run build", 
                exitCode: build.exitCode, 
                stdoutTail: redactText(build.stdout.slice(-1000)), 
                stderrTail: redactText(build.stderr.slice(-1000)) 
            });
            if (!build.ok) result.status = "failed";
        } else if (task.type === "mcp-smoke") {
            console.log(`[Runner] Running MCP smoke test for ${taskId}`);
            const r = await run("node", ["scripts/smoke-test.js"], root) as any;
            result.commandsRun.push({ 
                command: "node scripts/smoke-test.js", 
                exitCode: r.exitCode, 
                stdoutTail: redactText(r.stdout.slice(-2000)), 
                stderrTail: redactText(r.stderr.slice(-2000)) 
            });
            if (!r.ok) result.status = "failed";
        } else {
            result.status = "failed";
            result.summary = `Unknown task type: ${task.type}`;
        }

        // Get list of changed files
        const diffNameOnly = await run("git", ["diff", "--name-only"], root) as any;
        if (diffNameOnly.ok) {
            result.filesChanged = diffNameOnly.stdout.split("\n").map((f: string) => f.trim()).filter((f: string) => f.length > 0);
        }

        if (result.status === "done") {
            result.summary = redactText(result.summary || "Task completed successfully");
        }
    } catch (err: any) {
        result.status = "failed";
        result.summary = `Runner error: ${redactText(err.message)}`;
    }

    result.finishedAt = new Date().toISOString();
    result.durationMs = new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime();

    // Handle retry logic for failed tasks
    if (result.status === "failed" && shouldRetry(task, (await getRetryMeta(taskId))?.attempts || 0)) {
        const policy = task.retry || DEFAULT_RETRY_POLICY;
        const meta = await recordRetryAttempt(taskId, result.summary, policy);
        console.log(`[Runner] Task ${taskId} failed, scheduling retry ${meta.attempts}/${policy.maxAttempts} at ${meta.nextRetryAt}`);
        emitProgress(taskId, "retrying", { attempt: meta.attempts, nextRetryAt: meta.nextRetryAt });

        // Move back to inbox for retry
        if (await fs.stat(runningPath).catch(() => null)) {
            await fs.rename(runningPath, path.join(inboxDir, `${taskId}.json`));
        }
        await releaseTaskLock(taskId);
        return;
    }

    // Clear retry meta on success
    if (result.status === "done") {
        await clearRetryMeta(taskId);
    }

    // Finalize
    const targetDir = result.status === "done" ? doneDir : failedDir;
    // Redact the entire result object just in case
    const safeResult = redactSecrets(result);
    await fs.writeFile(path.join(targetDir, `${taskId}.json`), JSON.stringify(safeResult, null, 2));
    
    // Remove from running
    if (await fs.stat(runningPath).catch(() => null)) {
        await fs.unlink(runningPath);
    }

    // Release lock
    await releaseTaskLock(taskId);

    // Emit completion event
    emitProgress(taskId, result.status === "done" ? "completed" : "failed", {
        summary: result.summary,
        durationMs: result.durationMs,
    });

    // Report back to GitHub issue if this task came from one
    if (task.sourceIssue) {
        const repoUrl = process.env.GITHUB_REMOTE_URL || "";
        const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        if (match) {
            await reportTaskToIssue(match[1], match[2], task.sourceIssue, {
                status: result.status,
                summary: result.summary,
                reportPath: result.reportPath,
            });
        }
    }

    // Create Markdown Report
    const statusText = result.status === "done" ? "✅ DONE" : "❌ FAILED";
    let report = `# Task Report: ${taskId}\n\n`;
    report += `**Status**: ${statusText}\n`;
    report += `**Started**: ${result.startedAt}\n`;
    report += `**Finished**: ${result.finishedAt}\n\n`;
    report += `## Summary\n${redactText(result.summary)}\n\n`;
    
    report += `## Commands Run\n`;
    for (const cmd of result.commandsRun) {
        report += `### \`${cmd.command}\`\n`;
        report += `Exit Code: ${cmd.exitCode}\n\n`;
        if (cmd.stdoutTail) report += `#### Stdout\n\`\`\`\n${redactText(cmd.stdoutTail)}\n\`\`\`\n\n`;
        if (cmd.stderrTail) report += `#### Stderr\n\`\`\`\n${redactText(cmd.stderrTail)}\n\`\`\`\n\n`;
    }
    
    if (result.filesChanged.length > 0) {
        report += `## Files Changed\n`;
        for (const file of result.filesChanged) {
            report += `- ${file}\n`;
        }
        report += `\n`;
    }

    const diffStat = await run("git", ["diff", "--stat"], root) as any;
    report += `## Git Status\n\`\`\`\n${redactText(diffStat.stdout)}\n\`\`\`\n`;

    await fs.writeFile(path.join(reportsDir, `${taskId}.md`), report);
    await audit(`runner.${result.status}`, result.status === "done", { taskId });
    
    // Push result if task requires it or if it's the general policy
    if (task.requiresPush !== false) {
        await pushChanges(`Finish task ${taskId} with status ${result.status}`);
    }
}

async function runOnce() {
    if (!await pullChanges()) return;

    // Sync GitHub Issues into task queue (if configured)
    const repoUrl = process.env.GITHUB_REMOTE_URL || "";
    const repoMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (repoMatch && process.env.GITHUB_ISSUES_SYNC === "true") {
        const created = await syncIssuesToTasks(root, repoMatch[1], repoMatch[2]);
        if (created > 0) console.log(`[Runner] Synced ${created} new tasks from GitHub Issues`);
    }

    if (!(await fs.stat(inboxDir).catch(() => null))) {
        await fs.mkdir(inboxDir, { recursive: true });
    }

    const files = await fs.readdir(inboxDir);
    const taskFiles = files.filter(f => f.endsWith(".json") && !f.endsWith(".retry.json")).sort();

    if (taskFiles.length === 0) {
        console.log("[Runner] No tasks in inbox.");
        return;
    }

    // Load and sort by priority
    const loadedTasks: Array<{ file: string; task: TaskFile }> = [];
    for (const file of taskFiles) {
        try {
            const content = await fs.readFile(path.join(inboxDir, file), "utf8");
            loadedTasks.push({ file, task: JSON.parse(content) });
        } catch { /* skip malformed */ }
    }

    const sorted = sortByPriority(loadedTasks.map(t => t.task));
    const firstTask = sorted[0];
    if (!firstTask) return;

    const taskFile = path.join(inboxDir, `${firstTask.taskId}.json`);
    await processTask(taskFile);
}

async function runLoop() {
    const intervalSeconds = parseInt(process.env.RUNNER_INTERVAL_SECONDS || "30");
    const interval = intervalSeconds * 1000;
    console.log(`[Runner] Starting loop with interval ${intervalSeconds}s`);

    while (true) {
        try {
            await runOnce();
        } catch (err: any) {
            console.error("[Runner] Loop error:", redactText(err.message));
        }
        await new Promise(r => setTimeout(r, interval));
    }
}

const arg = process.argv[2];
if (arg === "--once") {
    runOnce().catch(err => console.error(redactText(err.message)));
} else if (arg === "--loop") {
    runLoop().catch(err => console.error(redactText(err.message)));
} else {
    console.log("Usage: node dist/runner/github-task-runner.js --once | --loop");
}
