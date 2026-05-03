import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, rel, run } from "../../gateway/utils.js";
import { root, agent } from "../../gateway/config.js";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

export function registerDesktopTools(server: McpServer)
{
	server.tool(
		"desktop.screenshot",
		"Capture a screenshot of the current screen. On Windows uses Python capture script with optional GitHub publish. On Linux/macOS saves PNG locally.",
		{
			publish: z.boolean().default(false).describe("Whether to commit and push to GitHub to get a raw URL (Windows only).")
		},
		async ({ publish }) => {
			const screenshotsDir = path.join(root, "screenshots");
			await fs.mkdir(screenshotsDir, { recursive: true });
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const outFile = path.join(screenshotsDir, `screenshot-${timestamp}.png`);

			if (isWin) {
				const scriptPath = path.join(root, "scripts", "win", "phase2", "getscreen-via-github-buffer", "scripts", "capture_and_validate_screenshot.py");
				const args = [scriptPath];
				if (publish) args.push("--publish");

				const r = await run("python", args, root) as any;

				let result;
				try {
					result = JSON.parse(r.stdout);
				} catch {
					result = { ok: false, error: "Failed to parse script output", stdout: r.stdout, stderr: r.stderr };
				}

				await audit("desktop.screenshot", result.capture?.ok || false, {
					publish,
					commit_sha: result.publish?.commit_sha,
					url: result.publish?.commit_raw_url
				});

				return out(result);
			}

			// Linux: try scrot, then import (ImageMagick), then gnome-screenshot
			if (!isMac) {
				const tools = [
					{ cmd: "bash", args: ["-c", `scrot "${outFile}" 2>&1 || import -window root "${outFile}" 2>&1 || gnome-screenshot -f "${outFile}" 2>&1`] },
				];

				for (const tool of tools) {
					const r = await run(tool.cmd, tool.args, root) as any;
					const exists = await fs.stat(outFile).catch(() => null);
					if (exists) {
						await audit("desktop.screenshot", true, { path: rel(outFile) });
						return out({ ok: true, path: rel(outFile), platform: "linux" });
					}
				}

				return out({ ok: false, error: "No screenshot tool available. Install scrot, imagemagick, or gnome-screenshot." });
			}

			// macOS: use screencapture
			const r = await run("bash", ["-c", `screencapture -x "${outFile}"`], root) as any;
			const exists = await fs.stat(outFile).catch(() => null);
			if (exists) {
				await audit("desktop.screenshot", true, { path: rel(outFile) });
				return out({ ok: true, path: rel(outFile), platform: "macos" });
			}
			return out({ ok: false, error: "screencapture failed", stderr: r.stderr });
		}
	);

	server.tool("desktop.active_window", "Get active window title.", {}, async () =>
	{
		if (isWin) {
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
		}

		if (isMac) {
			const r = await run("bash", ["-c", "osascript -e 'tell application \"System Events\" to get name of first application process whose frontmost is true'"], root) as any;
			return out({ ok: r.ok, title: r.stdout.trim() });
		}

		// Linux: xdotool
		const r = await run("bash", ["-c", "xdotool getactivewindow getwindowname 2>/dev/null || xprop -root _NET_ACTIVE_WINDOW | head -1"], root) as any;
		return out({ ok: r.ok, title: r.stdout.trim() });
	});

	server.tool("desktop.window_list", "List open windows.", {}, async () =>
	{
		if (isWin) {
			const psScript = `Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object MainWindowTitle, Id, ProcessName | ConvertTo-Json`;
			const r = await run("powershell", ["-NoProfile", "-Command", psScript], root) as any;
			return out({ ok: r.ok, windows: JSON.parse(r.stdout || "[]") });
		}

		if (isMac) {
			const r = await run("bash", ["-c", "osascript -e 'tell application \"System Events\" to get {name, unix id} of every process whose visible is true'"], root) as any;
			return out({ ok: r.ok, raw: r.stdout.trim() });
		}

		// Linux: wmctrl or xdotool
		const r = await run("bash", ["-c", "wmctrl -l 2>/dev/null || xdotool search --name '' getwindowname %@ 2>/dev/null || echo '[]'"], root) as any;
		return out({ ok: r.ok, raw: r.stdout.trim() });
	});
}
