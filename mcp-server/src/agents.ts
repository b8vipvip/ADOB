import { randomUUID } from "node:crypto";
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { MAX_WORKFLOW_WAIT_SECONDS, VERSION, projects } from "./config.js";
import { createMcpServer } from "./mcp-server.js";

const sharedSecret = process.env.MCP_SHARED_SECRET?.trim() ?? "";

function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  if (!sharedSecret) return next();
  if ((req.header("authorization") ?? "") !== `Bearer ${sharedSecret}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

function allowedHost(req: Request, res: Response, next: NextFunction): void {
  const raw = process.env.AUTODEVOPS_ALLOWED_HOSTS?.trim();
  if (!raw) return next();
  const allowed = new Set(raw.split(",").map((value: string) => value.trim().toLowerCase()).filter(Boolean));
  const host = (req.header("host") ?? "").toLowerCase();
  const hostname = host.startsWith("[") ? host : (host.split(":", 1)[0] ?? host);
  if (!allowed.has(host) && !allowed.has(hostname)) {
    res.status(403).json({ error: "host_not_allowed" });
    return;
  }
  next();
}

async function startHttp(): Promise<void> {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(allowedHost);
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.get("/health", (_req: Request, res: Response) => res.json({
    status: "ok",
    product: "ADOB automated development agents",
    projects: projects.length,
    version: VERSION,
    deploymentModes: ["VSR", "GHS"],
    maximumWorkflowWaitSeconds: MAX_WORKFLOW_WAIT_SECONDS,
  }));

  app.all("/mcp", bearerAuth, async (req: Request, res: Response) => {
    try {
      const sessionId = req.header("mcp-session-id");
      let transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id: string) => {
            transports.set(id, transport as StreamableHTTPServerTransport);
          },
        });
        transport.onclose = () => { if (transport?.sessionId) transports.delete(transport.sessionId); };
        await createMcpServer().connect(transport);
      }
      if (!transport) {
        res.status(400).json({ error: "invalid_or_missing_mcp_session" });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      if (!res.headersSent) res.status(500).json({ error: message });
    }
  });

  const host = process.env.AUTODEVOPS_HOST?.trim() || "127.0.0.1";
  const port = Number.parseInt(process.env.AUTODEVOPS_PORT ?? "8787", 10);
  app.listen(port, host, () => console.error(`ADOB automated development agents listening on http://${host}:${port}/mcp`));
}

async function main(): Promise<void> {
  const mode = process.env.AUTODEVOPS_TRANSPORT?.trim().toLowerCase() || "stdio";
  if (mode === "stdio") {
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }
  if (mode === "http") {
    await startHttp();
    return;
  }
  throw new Error(`Unsupported AUTODEVOPS_TRANSPORT: ${mode}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
