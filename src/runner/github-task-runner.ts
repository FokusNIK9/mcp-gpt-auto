import fs from "node:fs/promises";
import path from "node:path";
import { TaskFile, TaskResult } from "./task-types.js";
import { run, audit, rel, taskDir } from "../gateway/utils.js";
import { root } from "../gateway/config.js";

const queueDir = path.join(root, ".agent-queue");
const inboxDir = path.join(queueDir, "inbox");
const runningDir = path.join(queueDir, "running");
const doneDir = path.join(queueDir, "done");
const failedDir = path.join(queueDir, "failed");
const reportsDir = path.join(queueDir, "reports");

async function pullChanges() {
    console.log("[Runner] Pulling changes from GitHub...");
    // Use --ff-only to avoid merge conflicts in the runner
    const r = await run("git", ["pull", "--ff-only"], root) as any;
    if (!r.ok) {
        console.error("[Runner] git pull failed:", r.stderr);
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
    const status = await run("git", ["status"], root) as any;
    const diffStat = await run("git", ["diff", "--stat"], root) as any;
    
    console.log("[Runner] Git Status:\n", status.stdout);
    console.log("[Runner] Git Diff Stat:\n", diffStat.stdout);

    await run("git", ["add", "."], root);
    const commitR = await run("git", ["commit", "-m", `"${message}"`], root) as any;
    
    if (!commitR.ok && !commitR.stdout.includes("nothing to commit")) {
        console.error("[Runner] git commit failed:", commitR.stderr);
        return false;
    }
    
    const pushR = await run("git", ["push", "origin", "main"], root) as any;
    if (!pushR.ok) {
        console.error("[Runner] git push failed:", pushR.stderr);
        return false;
    }
    
    console.log("[Runner] Push successful.");
    return true;
}

async function processTask(taskPath: string) {
    const taskId = path.basename(taskPath, ".json");
    const runningPath = path.join(runningDir, `${taskId}.json`);
    
    console.log(`[Runner] Starting task: ${taskId}`);
    const content = await fs.readFile(taskPath, "utf8");
    const task = JSON.parse(content) as TaskFile;

    // Move to running
    await fs.rename(taskPath, runningPath);
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
            for (const cmd of task.commands) {
                console.log(`[Runner] Executing: ${cmd.command} ${cmd.args.join(" ")}`);
                const r = await run(cmd.command, cmd.args, root) as any;
                result.commandsRun.push({
                    command: `${cmd.command} ${cmd.args.join(" ")}`,
                    exitCode: r.exitCode,
                    stdoutTail: r.stdout.slice(-2000),
                    stderrTail: r.stderr.slice(-2000)
                });
                if (!r.ok) {
                    result.status = "failed";
                    result.summary = `Command failed: ${cmd.command}`;
                    break;
                }
            }
        } else if (task.type === "gemini") {
            const tDir = taskDir(taskId);
            await fs.mkdir(path.join(tDir, "result"), { recursive: true });
            const prompt = `# Task\n${task.instructions}\n\n# Rules\nReturn JSON result.\n`;
            await fs.writeFile(path.join(tDir, "prompt.md"), prompt);
            
            console.log(`[Runner] Running Gemini flow for ${taskId}`);
            // Use existing gemini command if available in path or as a tool
            const r = await run("gemini", ["--task", taskId], root) as any;
            result.commandsRun.push({
                command: `gemini --task ${taskId}`,
                exitCode: r.exitCode,
                stdoutTail: r.stdout.slice(-2000),
                stderrTail: r.stderr.slice(-2000)
            });
            if (!r.ok) {
                result.status = "failed";
                result.summary = "Gemini flow failed";
            }
        } else if (task.type === "review") {
            console.log(`[Runner] Running automated review for ${taskId}`);
            const build = await run("npm", ["run", "build"], root) as any;
            const test = await run("npm", ["test"], root) as any; // Assuming there might be tests
            
            result.summary = `Review complete. Build: ${build.ok ? "OK" : "FAILED"}`;
            result.commandsRun.push({ command: "npm run build", exitCode: build.exitCode, stdoutTail: build.stdout.slice(-1000), stderrTail: build.stderr.slice(-1000) });
            if (!build.ok) result.status = "failed";
        } else if (task.type === "mcp-smoke") {
            console.log(`[Runner] Running MCP smoke test for ${taskId}`);
            const r = await run("node", ["scripts/smoke-test.js"], root) as any;
            result.commandsRun.push({ command: "node scripts/smoke-test.js", exitCode: r.exitCode, stdoutTail: r.stdout.slice(-2000), stderrTail: r.stderr.slice(-2000) });
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
            result.summary = result.summary || "Task completed successfully";
        }
    } catch (err: any) {
        result.status = "failed";
        result.summary = `Runner error: ${err.message}`;
    }

    result.finishedAt = new Date().toISOString();

    // Finalize
    const targetDir = result.status === "done" ? doneDir : failedDir;
    await fs.writeFile(path.join(targetDir, `${taskId}.json`), JSON.stringify(result, null, 2));
    
    // Remove from running
    if (await fs.stat(runningPath).catch(() => null)) {
        await fs.unlink(runningPath);
    }

    // Create Markdown Report
    const statusText = result.status === "done" ? "✅ DONE" : "❌ FAILED";
    let report = `# Task Report: ${taskId}\n\n`;
    report += `**Status**: ${statusText}\n`;
    report += `**Started**: ${result.startedAt}\n`;
    report += `**Finished**: ${result.finishedAt}\n\n`;
    report += `## Summary\n${result.summary}\n\n`;
    
    report += `## Commands Run\n`;
    for (const cmd of result.commandsRun) {
        report += `### \`${cmd.command}\`\n`;
        report += `Exit Code: ${cmd.exitCode}\n\n`;
        if (cmd.stdoutTail) report += `#### Stdout\n\`\`\`\n${cmd.stdoutTail}\n\`\`\`\n\n`;
        if (cmd.stderrTail) report += `#### Stderr\n\`\`\`\n${cmd.stderrTail}\n\`\`\`\n\n`;
    }
    
    if (result.filesChanged.length > 0) {
        report += `## Files Changed\n`;
        for (const file of result.filesChanged) {
            report += `- ${file}\n`;
        }
        report += `\n`;
    }

    const diffStat = await run("git", ["diff", "--stat"], root) as any;
    report += `## Git Status\n\`\`\`\n${diffStat.stdout}\n\`\`\`\n`;

    await fs.writeFile(path.join(reportsDir, `${taskId}.md`), report);
    await audit(`runner.${result.status}`, result.status === "done", { taskId });
    
    // Push result if task requires it or if it's the general policy
    if (task.requiresPush !== false) {
        await pushChanges(`Finish task ${taskId} with status ${result.status}`);
    }
}

async function runOnce() {
    if (!await pullChanges()) return;

    if (!(await fs.stat(inboxDir).catch(() => null))) {
        await fs.mkdir(inboxDir, { recursive: true });
    }

    const files = await fs.readdir(inboxDir);
    const tasks = files.filter(f => f.endsWith(".json")).sort();

    if (tasks.length === 0) {
        console.log("[Runner] No tasks in inbox.");
        return;
    }

    const taskFile = path.join(inboxDir, tasks[0]);
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
            console.error("[Runner] Loop error:", err.message);
        }
        await new Promise(r => setTimeout(r, interval));
    }
}

const arg = process.argv[2];
if (arg === "--once") {
    runOnce().catch(err => console.error(err));
} else if (arg === "--loop") {
    runLoop().catch(err => console.error(err));
} else {
    console.log("Usage: node dist/runner/github-task-runner.js --once | --loop");
}
