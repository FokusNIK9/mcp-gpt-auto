import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, rel, run } from "../../gateway/utils.js";
import { root, agent } from "../../gateway/config.js";

export function registerDesktopTools(server: McpServer)
{
	server.tool("desktop.screenshot", "Take Windows screenshot.", {}, async () =>
	{
		const screenshotsDir = path.join(agent, "artifacts", "screenshots");
		await fs.mkdir(screenshotsDir, { recursive: true });
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const fileName = `${timestamp}.png`;
		const filePath = path.join(screenshotsDir, fileName);

		const psScript = `
			Add-Type -AssemblyName System.Windows.Forms
			Add-Type -AssemblyName System.Drawing
			$screen = [System.Windows.Forms.Screen]::PrimaryScreen
			$top    = $screen.Bounds.Top
			$left   = $screen.Bounds.Left
			$width  = $screen.Bounds.Width
			$height = $screen.Bounds.Height
			$bmp    = New-Object System.Drawing.Bitmap $width, $height
			$graphics = [System.Drawing.Graphics]::FromImage($bmp)
			$graphics.CopyFromScreen($left, $top, 0, 0, $bmp.Size)
			$bmp.Save("${filePath.replaceAll("\\", "\\\\")}", [System.Drawing.Imaging.ImageFormat]::Png)
			$graphics.Dispose()
			$bmp.Dispose()
		`;

		const r = await run("powershell", ["-Command", psScript], root);
		await audit("desktop.screenshot", Boolean((r as any).ok), { path: rel(filePath) });
		return out({ ok: (r as any).ok, path: rel(filePath), error: (r as any).stderr });
	});

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
