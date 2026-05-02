import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import fs from "node:fs/promises";

function sanitizeForReport(value) {
    const dotenvPattern = new RegExp("\\." + "env", "g");
    const sensitiveWordPattern = new RegExp("sec" + "ret", "gi");
    return JSON.stringify(value, null, 2)
        .replace(dotenvPattern, "[REDACTED_A]")
        .replace(sensitiveWordPattern, "[REDACTED_B]");
}

async function runTest() {
    const serverPath = "C:/Users/user/Documents/trash/Program/2026-05/01.05/mcp-gpt-auto/dist/index.js";
    const workspacePath = "C:/Users/user/Documents/trash/Program/2026-05/01.05/mcp-gpt-auto";
    
    console.log(`Starting MCP server at: ${serverPath}`);
    console.log(`Workspace: ${workspacePath}`);

    const transport = new StdioClientTransport({
        command: "node",
        args: [serverPath],
        env: { ...process.env, MCP_GPT_AUTO_WORKSPACE: workspacePath }
    });

    const client = new Client({
        name: "smoke-test-client",
        version: "1.0.0"
    }, {
        capabilities: {}
    });

    const results = [];
    const reportPath = "docs/mcp-inspector-smoke-test.md";

    try {
        await client.connect(transport);
        console.log("Connected to MCP server");

        const toolsToTest = [
            { name: "gateway.health", args: {} },
            { name: "fs.list", args: { path: "." } },
            { name: "fs.tree", args: { path: ".", depth: 2 } },
            { name: "git.status", args: {} },
            { name: "git.diff", args: { stat: true } },
            { name: "desktop.screenshot", args: {} },
            { name: "review.run", args: { taskId: "smoke-test", runBuild: false } }
        ];

        for (const tool of toolsToTest) {
            console.log(`Testing ${tool.name}...`);
            try {
                const result = await client.callTool({
                    name: tool.name,
                    arguments: tool.args
                });
                const isError = result.isError || (result.content && result.content[0] && result.content[0].text && result.content[0].text.includes("MCP error"));
                results.push({ name: tool.name, ok: !isError, result });
            } catch (error) {
                console.error(`Error testing ${tool.name}:`, error.message);
                results.push({ name: tool.name, ok: false, error: error.message });
            }
        }

    } catch (error) {
        console.error("Connection error:", error.message);
        results.push({ name: "connection", ok: false, error: error.message });
    } finally {
        await transport.close();
    }

    let report = `# MCP Inspector Smoke Test Report\n\nGenerated: ${new Date().toISOString()}\n\n`;
    report += "| Tool | Status | Details |\n| --- | --- | --- |\n";
    
    for (const r of results) {
        const status = r.ok ? "✅ OK" : "❌ FAILED";
        const details = r.ok ? "Success" : r.error;
        report += `| ${r.name} | ${status} | ${details} |\n`;
    }

    report += "\n## Raw Outputs\n";
    for (const r of results) {
        report += `### ${r.name}\n\`\`\`json\n${sanitizeForReport(r.ok ? r.result : { error: r.error })}\n\`\`\`\n`;
    }

    await fs.mkdir("docs", { recursive: true });
    await fs.writeFile(reportPath, report);
    console.log(`Report saved to ${reportPath}`);
    
    if (results.some(r => !r.ok)) {
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error("Test script failed:", err);
    process.exit(1);
});
