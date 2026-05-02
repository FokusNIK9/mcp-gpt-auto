import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, rel, run } from "../../gateway/utils.js";
import { root, agent } from "../../gateway/config.js";

export function registerDesktopTools(server: McpServer)
{
	server.tool(
		"desktop.screenshot",
		"Capture, validate, and publish a screenshot to GitHub (Version 2.0.0 protocol). " +
		"MANDATORY: For visual analysis, you MUST open the 'publish.commit_raw_url' as an image. " +
		"Do NOT analyze 'latest-screenshot.png' as it is mutable. " +
		"Set 'analysis.ok=true' ONLY after opening the immutable commit-pinned URL.",
		{
			publish: z.boolean().default(true).describe("Whether to commit and push to GitHub to get a raw URL for visual analysis.")
		},
		async ({ publish }) => {
			const scriptPath = path.join(root, "scripts", "win", "phase2", "getscreen-via-github-buffer", "scripts", "capture_and_validate_screenshot.py");
			const args = [scriptPath];
			if (publish) {
				args.push("--publish");
			}

			// We use the 'run' utility from gateway/utils.ts
			const r = await run("python", args, root) as any;
			
			let result;
			try {
				result = JSON.parse(r.stdout);
			} catch (e) {
				result = { ok: false, error: "Failed to parse script output", stdout: r.stdout, stderr: r.stderr };
			}

			await audit("desktop.screenshot", result.capture?.ok || false, { 
				publish, 
				commit_sha: result.publish?.commit_sha,
				url: result.publish?.commit_raw_url 
			});

			return out(result);
		}
	);

	server.tool("desktop.active_window", "Get active window title.", {}, async () =>
	{
		const psScript = `
			Add-Type @"
			  using System;
			  using System.Runtime.InteropServices;
			  using System.Text;
			  public class Win32 {
				[DllImport("user32.dll")]
				public static extern IntPtr GetForegroundWindow();
				[DllImport("user32.dll")]
				public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
			  }
"@
			$hWnd = [Win32]::GetForegroundWindow()
			$text = New-Object System.Text.StringBuilder 256
			if ([Win32]::GetWindowText($hWnd, $text, $text.Capacity) -gt 0) {
				$text.ToString()
			}
		`;
		const r = await run("powershell", ["-NoProfile", "-Command", psScript], root) as any;
		return out({ ok: r.ok, title: r.stdout.trim() });
	});

	server.tool("desktop.window_list", "List open windows.", {}, async () =>
	{
		const psScript = `Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object MainWindowTitle, Id, ProcessName | ConvertTo-Json`;
		const r = await run("powershell", ["-NoProfile", "-Command", psScript], root) as any;
		return out({ ok: r.ok, windows: JSON.parse(r.stdout || "[]") });
	});
}
