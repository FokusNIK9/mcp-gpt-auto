/**
 * SSE MCP transport for the action bridge.
 * Exposes all mcp-gpt-auto tools via SSE so external clients
 * (like Devin) can connect as MCP clients through the ngrok tunnel.
 *
 * Endpoints:
 *   GET  /mcp       — SSE stream (establish connection)
 *   POST /mcp/messages — JSON-RPC messages from client
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { registerFileSystemTools } from "../servers/filesystem/index.js";
import { registerShellTools } from "../servers/shell/index.js";
import { registerGitTools } from "../servers/git/index.js";
import { registerTaskTools } from "../servers/tasks/index.js";
import { registerSubagentTools } from "../servers/subagents/index.js";
import { registerReviewTools } from "../servers/review/index.js";
import { registerDesktopTools } from "../servers/desktop/index.js";

// Active SSE transports keyed by session ID
const transports: Record<string, SSEServerTransport> = {};

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mcp-gpt-auto",
    version: "0.2.0",
  });

  registerFileSystemTools(server);
  registerShellTools(server);
  registerGitTools(server);
  registerTaskTools(server);
  registerSubagentTools(server);
  registerReviewTools(server);
  registerDesktopTools(server);

  server.tool("gateway.health", "Health check.", {}, async () => ({
    content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
  }));

  return server;
}

export function registerMcpSseRoutes(app: express.Application) {
  // SSE stream endpoint
  app.get("/mcp", async (req, res) => {
    console.log("[MCP-SSE] New client connecting...");
    try {
      const transport = new SSEServerTransport("/mcp/messages", res);
      const sessionId = transport.sessionId;
      transports[sessionId] = transport;

      transport.onclose = () => {
        console.log(`[MCP-SSE] Session closed: ${sessionId}`);
        delete transports[sessionId];
      };

      const server = createMcpServer();
      await server.connect(transport);
      console.log(`[MCP-SSE] Session established: ${sessionId}`);
    } catch (err) {
      console.error("[MCP-SSE] Error establishing stream:", err);
      if (!res.headersSent) {
        res.status(500).send("Error establishing SSE stream");
      }
    }
  });

  // JSON-RPC message endpoint
  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId parameter" });
    }

    const transport = transports[sessionId];
    if (!transport) {
      return res.status(404).json({ error: "Session not found" });
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      console.error("[MCP-SSE] Error handling message:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error handling request" });
      }
    }
  });
}
