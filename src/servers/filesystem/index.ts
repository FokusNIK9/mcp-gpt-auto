import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { out, audit, safe, rel } from "../../gateway/utils.js";

export function registerFileSystemTools(server: McpServer)
{
	server.tool("fs.read", "Read text file.", { path: z.string() }, async ({ path: p }) =>
	{
		const file = safe(p);
		const text = await fs.readFile(file, "utf8");
		await audit("fs.read", true, { path: rel(file) });
		return out({ ok: true, path: rel(file), text });
	});

	server.tool("fs.write", "Write text file.", { path: z.string(), text: z.string() }, async ({ path: p, text }) =>
	{
		const file = safe(p);
		await fs.mkdir(path.dirname(file), { recursive: true });
		await fs.writeFile(file, text, "utf8");
		await audit("fs.write", true, { path: rel(file) });
		return out({ ok: true, path: rel(file) });
	});

	server.tool("fs.patch", "Replace text in file.", { path: z.string(), search: z.string(), replace: z.string() }, async ({ path: p, search, replace }) =>
	{
		const file = safe(p);
		const before = await fs.readFile(file, "utf8");

		if (!before.includes(search))
		{
			throw new Error("Search text not found.");
		}

		await fs.writeFile(file, before.replace(search, replace), "utf8");
		await audit("fs.patch", true, { path: rel(file) });
		return out({ ok: true, path: rel(file) });
	});

	server.tool("fs.list", "List directory contents.", { path: z.string().default(".") }, async ({ path: p }) =>
	{
		const dir = safe(p);
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const result = entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
		await audit("fs.list", true, { path: rel(dir) });
		return out({ ok: true, path: rel(dir), entries: result });
	});

	server.tool("fs.tree", "Get directory tree.", { path: z.string().default("."), depth: z.number().default(3) }, async ({ path: p, depth }) =>
	{
		const dir = safe(p);
		async function getTree(current: string, currentDepth: number): Promise<any>
		{
			if (currentDepth > depth) return null;
			const entries = await fs.readdir(current, { withFileTypes: true });
			const children = [];
			for (const e of entries)
			{
				if (e.name === ".git" || e.name === "node_modules") continue;
				const full = path.join(current, e.name);
				if (e.isDirectory())
				{
					children.push({ name: e.name, isDirectory: true, children: await getTree(full, currentDepth + 1) });
				}
				else
				{
					children.push({ name: e.name, isDirectory: false });
				}
			}
			return children;
		}
		const tree = await getTree(dir, 1);
		await audit("fs.tree", true, { path: rel(dir), depth });
		return out({ ok: true, path: rel(dir), tree });
	});
}
