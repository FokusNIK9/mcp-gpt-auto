/**
 * Tunnel management — auto-setup HTTPS tunnel via cloudflared or ngrok.
 * Provides a public URL for the Action Bridge so ChatGPT Custom GPT can reach it.
 *
 * Priority: cloudflared (free, no limits) > ngrok (needs auth token)
 */

import { execFile, ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let tunnelProcess: ChildProcess | null = null;
let publicUrl: string | null = null;

export interface TunnelConfig {
	/** Port to tunnel to */
	port: number;
	/** Preferred tunnel tool: "cloudflared" | "ngrok" | "auto" */
	provider?: "cloudflared" | "ngrok" | "auto";
	/** Custom subdomain (cloudflared named tunnels only) */
	subdomain?: string;
}

/**
 * Check if a tunnel tool is available.
 */
async function isAvailable(cmd: string): Promise<boolean> {
	try {
		await execFileAsync("which", [cmd]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Start a cloudflared quick tunnel (free, no account needed).
 */
async function startCloudflared(port: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = execFile("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`], {
			timeout: 30000,
		});

		tunnelProcess = proc;
		let output = "";
		let resolved = false;

		const handleOutput = (data: Buffer) => {
			output += data.toString();
			// cloudflared prints the URL to stderr
			const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
			if (match && !resolved) {
				resolved = true;
				publicUrl = match[0];
				console.log(`[Tunnel] Cloudflared URL: ${publicUrl}`);
				resolve(publicUrl!);
			}
		};

		proc.stderr?.on("data", handleOutput);
		proc.stdout?.on("data", handleOutput);

		proc.on("error", (err) => {
			if (!resolved) reject(new Error(`cloudflared failed: ${err.message}`));
		});

		proc.on("exit", (code) => {
			if (!resolved) reject(new Error(`cloudflared exited with code ${code}`));
			tunnelProcess = null;
			publicUrl = null;
		});

		// Timeout
		setTimeout(() => {
			if (!resolved) {
				proc.kill();
				reject(new Error("cloudflared timed out (30s) — no URL received"));
			}
		}, 30000);
	});
}

/**
 * Start an ngrok tunnel.
 */
async function startNgrok(port: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = execFile("ngrok", ["http", String(port), "--log", "stdout", "--log-format", "json"], {
			timeout: 15000,
		});

		tunnelProcess = proc;
		let resolved = false;

		proc.stdout?.on("data", (data: Buffer) => {
			const lines = data.toString().split("\n");
			for (const line of lines) {
				try {
					const parsed = JSON.parse(line);
					if (parsed.url && parsed.url.startsWith("https://")) {
						if (!resolved) {
							resolved = true;
							publicUrl = parsed.url;
							console.log(`[Tunnel] ngrok URL: ${publicUrl}`);
							resolve(publicUrl!);
						}
					}
				} catch { /* not JSON */ }
			}
		});

		proc.on("error", (err) => {
			if (!resolved) reject(new Error(`ngrok failed: ${err.message}`));
		});

		proc.on("exit", (code) => {
			if (!resolved) reject(new Error(`ngrok exited with code ${code}`));
			tunnelProcess = null;
			publicUrl = null;
		});

		setTimeout(() => {
			if (!resolved) {
				proc.kill();
				reject(new Error("ngrok timed out (15s) — no URL received"));
			}
		}, 15000);
	});
}

/**
 * Start a tunnel to expose the Action Bridge publicly.
 * Returns the public HTTPS URL.
 */
export async function startTunnel(config: TunnelConfig): Promise<string> {
	const provider = config.provider || "auto";

	if (provider === "cloudflared" || provider === "auto") {
		if (await isAvailable("cloudflared")) {
			return startCloudflared(config.port);
		}
		if (provider === "cloudflared") {
			throw new Error("cloudflared not found. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
		}
	}

	if (provider === "ngrok" || provider === "auto") {
		if (await isAvailable("ngrok")) {
			return startNgrok(config.port);
		}
		if (provider === "ngrok") {
			throw new Error("ngrok not found. Install: https://ngrok.com/download");
		}
	}

	throw new Error("No tunnel tool available. Install cloudflared (recommended) or ngrok.");
}

/**
 * Stop the running tunnel.
 */
export function stopTunnel(): void {
	if (tunnelProcess) {
		tunnelProcess.kill();
		tunnelProcess = null;
		publicUrl = null;
		console.log("[Tunnel] Stopped.");
	}
}

/**
 * Get the current public URL (or null if no tunnel is running).
 */
export function getPublicUrl(): string | null {
	return publicUrl;
}
