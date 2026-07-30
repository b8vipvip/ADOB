import { randomUUID } from "node:crypto";

import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const DeploymentModeSchema = z.enum(["VSR", "GHS"]);
type DeploymentMode = z.infer<typeof DeploymentModeSchema>;

const DEPLOYMENT_MODES: Record<
  DeploymentMode,
  {
    code: DeploymentMode;
    name: string;
    summary: string;
    executionPlane: string;
    connection: string;
    bestFor: string;
  }
> = {
  VSR: {
    code: "VSR",
    name: "VPS Self-hosted Runner",
    summary:
      "GitHub Actions executes the allow-listed project workflow directly on a persistent self-hosted Runner installed on the VPS.",
    executionPlane: "VPS-hosted GitHub Runner",
    connection: "No deployment SSH hop; the workflow already runs on the VPS.",
    bestFor:
      "Projects that keep a trusted persistent Runner online and need direct deployment, diagnostics, status, and rollback jobs.",
  },
  GHS: {
    code: "GHS",
    name: "GitHub-hosted SSH",
    summary:
      "A GitHub-hosted Runner checks out the exact tested revision, then uses pinned-host-key SSH and rsync to stage and deploy it on the VPS.",
    executionPlane: "GitHub-hosted Runner plus VPS deployment script",
    connection: "Pinned SSH/rsync from GitHub Actions to a dedicated VPS deployment account.",
    bestFor:
      "Projects that do not want a persistent GitHub Runner on the VPS and can store dedicated SSH credentials in GitHub Actions secrets.",
  },
};

const WorkflowSchema = z.object({
  deploy: z.string().min(1),
  diagnose: z.string().min(1),
  rollback: z.string().min(1),
});

const ProjectSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  name: z.string().min(1),
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  productionBranch: z.string().min(1).default("main"),
  statusBranch: z.string().min(1).default("ops-status"),
  statusPath: z.string().min(1).default("status/status.json"),
  deploymentMode: DeploymentModeSchema.default("VSR"),
  workflows: WorkflowSchema,
});

type Project = z.infer<typeof ProjectSchema>;

type WorkflowRun = {
  id: number;
  name: string;
  display_title: string;
  status: string;
  conclusion: string | null;
  event: string;
  head_branch: string | null;
  head_sha: string;
  html_url: string;
  created_at: string;
  updated_at: string;
};

type GitHubContent = {
  type: string;
  encoding: string;
  content: string;
  sha: string;
};

const projects = loadProjects();
const projectMap = new Map(projects.map((project) => [project.id, project]));
const githubToken = process.env.GITHUB_TOKEN?.trim() ?? "";
const sharedSecret = process.env.MCP_SHARED_SECRET?.trim() ?? "";

function loadProjects(): Project[] {
  const raw = process.env.AUTODEVOPS_PROJECTS_JSON?.trim();
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return z.array(ProjectSchema).parse(parsed);
}

function requireProject(projectId: string): Project {
  const project = projectMap.get(projectId);
  if (!project) throw new Error(`Unknown project_id: ${projectId}`);
  return project;
}

function modeDetails(mode: DeploymentMode) {
  return DEPLOYMENT_MODES[mode];
}

function resolveDeploymentMode(project: Project, requestedMode?: DeploymentMode): DeploymentMode {
  const mode = requestedMode ?? project.deploymentMode;
  if (mode !== project.deploymentMode) {
    throw new Error(
      `Deployment mode mismatch for ${project.id}: requested ${mode}, configured ${project.deploymentMode}. Update the server-side project registry before switching modes.`,
    );
  }
  return mode;
}

async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is not configured on the MCP server");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "autodevops-bridge/0.2.0",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 1000);
    throw new Error(`GitHub API ${response.status} for ${path}: ${body}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function readProjectStatus(project: Project): Promise<Record<string, unknown>> {
  const path = `/repos/${project.repo}/contents/${encodePath(project.statusPath)}?ref=${encodeURIComponent(project.statusBranch)}`;
  const file = await githubRequest<GitHubContent>(path);
  if (file.type !== "file" || file.encoding !== "base64") {
    throw new Error(`Unexpected status object for ${project.id}`);
  }

  const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
  const value: unknown = JSON.parse(decoded);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid status JSON for ${project.id}`);
  }
  return value as Record<string, unknown>;
}

async function recentWorkflowRuns(project: Project, limit: number): Promise<WorkflowRun[]> {
  const result = await githubRequest<{ workflow_runs: WorkflowRun[] }>(
    `/repos/${project.repo}/actions/runs?per_page=${limit}`,
  );
  return result.workflow_runs;
}

async function dispatchWorkflow(
  project: Project,
  workflowFile: string,
  ref: string,
  inputs: Record<string, string> = {},
): Promise<void> {
  const workflow = encodeURIComponent(workflowFile);
  await githubRequest<void>(
    `/repos/${project.repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({ ref, inputs }),
    },
  );
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "autodevops-bridge", version: "0.2.0" });

  server.registerTool(
    "list_deployment_modes",
    {
      title: "List ADOB deployment modes",
      description:
        "Return the canonical ADOB deployment mode codes. VSR means VPS Self-hosted Runner; GHS means GitHub-hosted SSH. These are deployment execution modes, not MCP stdio/HTTP transports.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      textResult({
        modes: [DEPLOYMENT_MODES.VSR, DEPLOYMENT_MODES.GHS],
        declarationRule:
          "Use the exact uppercase code VSR or GHS in project configuration and deployment requests.",
      }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List registered projects",
      description:
        "List the projects this AutoDevOps Bridge instance is allowed to manage, including each project's configured VSR or GHS deployment mode.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      textResult({
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          repo: project.repo,
          productionBranch: project.productionBranch,
          deploymentMode: project.deploymentMode,
          deploymentModeName: modeDetails(project.deploymentMode).name,
        })),
      }),
  );

  server.registerTool(
    "get_project_status",
    {
      title: "Get project status",
      description:
        "Read the latest sanitized production status snapshot and report whether the project is configured for VSR or GHS deployment.",
      inputSchema: {
        project_id: z.string().describe("Registered project identifier"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project_id }) => {
      try {
        const project = requireProject(project_id);
        const status = await readProjectStatus(project);
        return textResult({
          project: project.id,
          deploymentMode: modeDetails(project.deploymentMode),
          status,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_recent_workflow_runs",
    {
      title: "Get recent workflow runs",
      description:
        "Read recent GitHub Actions workflow states for a registered project and include its configured VSR or GHS deployment mode.",
      inputSchema: {
        project_id: z.string().describe("Registered project identifier"),
        limit: z.number().int().min(1).max(20).default(10),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project_id, limit }) => {
      try {
        const project = requireProject(project_id);
        const runs = await recentWorkflowRuns(project, limit);
        return textResult({
          project: project.id,
          deploymentMode: project.deploymentMode,
          runs,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "trigger_deploy",
    {
      title: "Deploy trusted production release",
      description:
        "Trigger the allow-listed production workflow using the project's configured ADOB mode. Declare mode=VSR or mode=GHS explicitly when clarity matters; a mismatched declaration is rejected.",
      inputSchema: {
        project_id: z.string().describe("Registered project identifier"),
        mode: DeploymentModeSchema.optional().describe(
          "Canonical ADOB deployment mode: VSR (VPS Self-hosted Runner) or GHS (GitHub-hosted SSH). Defaults to the project registry value.",
        ),
        ref: z
          .string()
          .optional()
          .describe("Trusted branch or commit; defaults to the configured production branch"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project_id, mode, ref }) => {
      try {
        const project = requireProject(project_id);
        const deploymentMode = resolveDeploymentMode(project, mode);
        const releaseRef = ref?.trim() || project.productionBranch;
        await dispatchWorkflow(project, project.workflows.deploy, releaseRef);
        return textResult({
          accepted: true,
          project: project.id,
          deploymentMode: modeDetails(deploymentMode),
          workflow: project.workflows.deploy,
          ref: releaseRef,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "trigger_diagnose",
    {
      title: "Collect sanitized diagnostics",
      description:
        "Trigger the allow-listed diagnostics workflow with bounded inputs and report the project's configured VSR or GHS mode.",
      inputSchema: {
        project_id: z.string().describe("Registered project identifier"),
        service: z.string().min(1).max(80),
        lines: z.enum(["100", "200", "500"]).default("200"),
        since: z.enum(["15m", "30m", "2h", "1d"]).default("30m"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project_id, service, lines, since }) => {
      try {
        const project = requireProject(project_id);
        await dispatchWorkflow(project, project.workflows.diagnose, project.productionBranch, {
          service,
          lines,
          since,
        });
        return textResult({
          accepted: true,
          project: project.id,
          deploymentMode: project.deploymentMode,
          workflow: project.workflows.diagnose,
          inputs: { service, lines, since },
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "trigger_rollback",
    {
      title: "Roll back production release",
      description:
        "Trigger the allow-listed rollback workflow. The literal confirmation value ROLLBACK is required. The result identifies the configured VSR or GHS mode.",
      inputSchema: {
        project_id: z.string().describe("Registered project identifier"),
        confirm: z.literal("ROLLBACK"),
        release_sha: z
          .string()
          .max(64)
          .optional()
          .describe("Optional target SHA; blank lets the workflow choose the previous release"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ project_id, confirm, release_sha }) => {
      try {
        const project = requireProject(project_id);
        await dispatchWorkflow(project, project.workflows.rollback, project.productionBranch, {
          confirm,
          release_sha: release_sha?.trim() ?? "",
        });
        return textResult({
          accepted: true,
          project: project.id,
          deploymentMode: project.deploymentMode,
          workflow: project.workflows.rollback,
          release_sha: release_sha?.trim() || null,
          warning: "Application rollback may not reverse database migrations.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}

function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  if (!sharedSecret) {
    next();
    return;
  }

  const supplied = req.header("authorization") ?? "";
  if (supplied !== `Bearer ${sharedSecret}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

function allowedHost(req: Request, res: Response, next: NextFunction): void {
  const raw = process.env.AUTODEVOPS_ALLOWED_HOSTS?.trim();
  if (!raw) {
    next();
    return;
  }

  const allowed = new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
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

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      projects: projects.length,
      version: "0.2.0",
      deploymentModes: ["VSR", "GHS"],
    });
  });

  app.all("/mcp", bearerAuth, async (req, res) => {
    try {
      const sessionId = req.header("mcp-session-id");
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport as StreamableHTTPServerTransport);
          },
        });
        transport.onclose = () => {
          if (transport?.sessionId) transports.delete(transport.sessionId);
        };
        const server = createMcpServer();
        await server.connect(transport);
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
  app.listen(port, host, () => {
    console.error(`AutoDevOps Bridge MCP listening on http://${host}:${port}/mcp`);
  });
}

async function main(): Promise<void> {
  const transportMode = process.env.AUTODEVOPS_TRANSPORT?.trim().toLowerCase() || "stdio";
  if (transportMode === "stdio") {
    const server = createMcpServer();
    await server.connect(new StdioServerTransport());
    return;
  }
  if (transportMode === "http") {
    await startHttp();
    return;
  }
  throw new Error(`Unsupported AUTODEVOPS_TRANSPORT: ${transportMode}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exit(1);
});
