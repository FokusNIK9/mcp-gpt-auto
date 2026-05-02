import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, rel, taskDir, run } from "../../gateway/utils.js";
import { root } from "../../gateway/config.js";
import { redactText } from "../../gateway/redact.js";

export function registerReviewTools(server: McpServer)
{
	server.tool("review.bundle", "Create review bundle.", { taskId: z.string() }, async ({ taskId }) =>
	{
		const dir = taskDir(taskId);
		const reviewDir = path.join(dir, "review");
		await fs.mkdir(reviewDir, { recursive: true });
		const status = await run("git", ["status", "--short"], root) as any;
		const diff = await run("git", ["diff"], root) as any;
		const stdout = await fs.readFile(path.join(dir, "result", "subagent-stdout.txt"), "utf8").catch(() => "");
		const bundle = `# Review ${taskId}\n\n## Git status\n\`\`\`\n${redactText(status.stdout)}\n\`\`\`\n\n## Subagent stdout\n\`\`\`\n${redactText(stdout)}\n\`\`\`\n\n## Diff\n\`\`\`diff\n${redactText(diff.stdout)}\n\`\`\`\n`;
		await fs.writeFile(path.join(reviewDir, "review-bundle.md"), bundle);
		await audit("review.bundle", true, { taskId });
		return out({ ok: true, path: rel(path.join(reviewDir, "review-bundle.md")) });
	});

	server.tool("review.run", "Automated code review.", { taskId: z.string(), runBuild: z.boolean().default(true) }, async ({ taskId, runBuild }) =>
	{
		const dir = taskDir(taskId);
		const reviewDir = path.join(dir, "review");
		await fs.mkdir(reviewDir, { recursive: true });

		const status = await run("git", ["status", "--short"], root) as any;
		const stat = await run("git", ["diff", "--stat"], root) as any;
		const diff = await run("git", ["diff", "--unified=0"], root) as any;

		const issues: any[] = [];
		const secrets = ["api_key", "apikey", "token", "secret", "password", "BEGIN PRIVATE KEY", ".env"];
		const addedLines = diff.stdout
			.split("\n")
			.filter((line: string) => line.startsWith("+") && !line.startsWith("+++"))
			.join("\n")
			.toLowerCase();

		for (const s of secrets)
		{
			if (addedLines.includes(s.toLowerCase()))
			{
				issues.push({ severity: "critical", message: `Potential secret found: ${s}` });
			}
		}

		let buildStatus = "skipped";

		if (runBuild)
		{
			const buildR = await run("npm", ["run", "build"], root) as any;
			buildStatus = buildR.ok ? "passed" : "failed";
			if (!buildR.ok)
			{
				issues.push({ severity: "high", message: "Build failed" });
			}
		}

		const statusText = issues.some(i => i.severity === "critical") ? "rejected" : (issues.some(i => i.severity === "high") ? "needs_changes" : "approved");
		const decision = statusText === "approved" ? "commit" : (statusText === "needs_changes" ? "request_subagent_fix" : "ask_user");

		const result = {
			status: statusText,
			summary: `Review for ${taskId}. Issues found: ${issues.length}`,
			diffReviewed: true,
			tests: { build: buildStatus },
			issues,
			decision
		};

		await fs.writeFile(path.join(reviewDir, "review-result.json"), JSON.stringify(result, null, 2));

		const report = `# Review Report: ${taskId}\n\nStatus: ${statusText}\nDecision: ${decision}\n\n## Issues\n${issues.length ? issues.map(i => `- [${i.severity}] ${i.message}`).join("\n") : "None"}\n\n## Git Status\n\`\`\`\n${redactText(status.stdout)}\n\`\`\`\n\n## Diff Stat\n\`\`\`\n${redactText(stat.stdout)}\n\`\`\`\n`;
		await fs.writeFile(path.join(reviewDir, "review.md"), report);

		await audit("review.run", true, { taskId, status: statusText });
		return out(result);
	});
}
