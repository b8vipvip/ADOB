import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_TRIGGER_WAIT_SECONDS,
  DEPLOYMENT_MODES,
  DeploymentModeSchema,
  MAX_WORKFLOW_WAIT_SECONDS,
  VERSION,
  WorkflowOperationSchema,
  modeDetails,
  projects,
  requireProject,
  resolveDeploymentMode,
  workflowForOperation,
} from "./config.js";
import {
  dispatchAndTrack,
  getWorkflowRun,
  readProjectStatus,
  recentWorkflowRuns,
  summarizeWorkflowRun,
  waitForWorkflowRun,
  workflowStatePolicy,
} from "./github-workflows.js";

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

const waitSecondsSchema = z.number().int().min(0).max(MAX_WORKFLOW_WAIT_SECONDS).default(DEFAULT_TRIGGER_WAIT_SECONDS);

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "adob-automated-development-agents", version: VERSION });

  server.registerTool("list_deployment_modes", {
    title: "List ADOB deployment modes",
    description: "Return the canonical VSR and GHS production execution modes.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => textResult({ modes: [DEPLOYMENT_MODES.VSR, DEPLOYMENT_MODES.GHS] }));

  server.registerTool("list_projects", {
    title: "List registered projects",
    description: "List projects managed by the ADOB automated development agents.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => textResult({ projects: projects.map((project) => ({
    id: project.id,
    name: project.name,
    repo: project.repo,
    productionBranch: project.productionBranch,
    deploymentMode: project.deploymentMode,
    deploymentModeName: modeDetails(project.deploymentMode).name,
  })) }));

  server.registerTool("get_project_status", {
    title: "Get project status",
    description: "Read the sanitized production status snapshot for a registered project.",
    inputSchema: { project_id: z.string() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ project_id }) => {
    try {
      const project = requireProject(project_id);
      return textResult({ project: project.id, deploymentMode: modeDetails(project.deploymentMode), status: await readProjectStatus(project) });
    } catch (error) { return errorResult(error); }
  });

  server.registerTool("get_recent_workflow_runs", {
    title: "Get recent workflow runs",
    description: "Read recent GitHub Actions runs. Queued or in-progress runs are pending, not failed.",
    inputSchema: { project_id: z.string(), limit: z.number().int().min(1).max(20).default(10) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ project_id, limit }) => {
    try {
      const project = requireProject(project_id);
      const runs = await recentWorkflowRuns(project, limit);
      return textResult({ project: project.id, deploymentMode: project.deploymentMode, policy: workflowStatePolicy(), runs: runs.map(summarizeWorkflowRun) });
    } catch (error) { return errorResult(error); }
  });

  server.registerTool("get_workflow_run", {
    title: "Get one workflow run",
    description: "Read one GitHub Actions run by ID and classify its lifecycle state.",
    inputSchema: { project_id: z.string(), run_id: z.number().int().positive() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ project_id, run_id }) => {
    try {
      const project = requireProject(project_id);
      return textResult({ project: project.id, run: summarizeWorkflowRun(await getWorkflowRun(project, run_id)), policy: workflowStatePolicy() });
    } catch (error) { return errorResult(error); }
  });

  server.registerTool("wait_for_workflow_run", {
    title: "Wait for or recheck a workflow run",
    description: "Poll GitHub Actions for up to 300 seconds. Timeout while queued or running returns pending, never failure.",
    inputSchema: {
      project_id: z.string(),
      run_id: z.number().int().positive().optional(),
      operation: WorkflowOperationSchema.optional(),
      ref: z.string().optional(),
      started_after: z.string().optional(),
      max_wait_seconds: z.number().int().min(0).max(MAX_WORKFLOW_WAIT_SECONDS).default(MAX_WORKFLOW_WAIT_SECONDS),
      poll_interval_seconds: z.number().int().min(5).max(30).default(DEFAULT_POLL_INTERVAL_SECONDS),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ project_id, run_id, operation, ref, started_after, max_wait_seconds, poll_interval_seconds }) => {
    try {
      const project = requireProject(project_id);
      if (run_id === undefined && operation === undefined) throw new Error("Provide run_id or operation");
      const workflowFile = operation ? workflowForOperation(project, operation) : undefined;
      const result = await waitForWorkflowRun(project, {
        runId: run_id,
        workflowFile,
        ref: ref?.trim() || undefined,
        startedAfter: started_after?.trim() || undefined,
      }, max_wait_seconds, poll_interval_seconds);
      return textResult({ project: project.id, operation: operation ?? null, workflow: workflowFile ?? null, ...result });
    } catch (error) { return errorResult(error); }
  });

  server.registerTool("trigger_deploy", {
    title: "Deploy trusted production release",
    description: "Trigger deployment. Set wait_seconds=0 for parallel work or up to 300 to poll. Running is pending, not failure.",
    inputSchema: {
      project_id: z.string(),
      mode: DeploymentModeSchema.optional(),
      ref: z.string().optional(),
      wait_seconds: waitSecondsSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ project_id, mode, ref, wait_seconds }) => {
    try {
      const project = requireProject(project_id);
      const deploymentMode = resolveDeploymentMode(project, mode);
      const releaseRef = ref?.trim() || project.productionBranch;
      return textResult({ ...(await dispatchAndTrack(project, "deploy", releaseRef, {}, wait_seconds)), deploymentMode: modeDetails(deploymentMode) });
    } catch (error) { return errorResult(error); }
  });

  server.registerTool("trigger_diagnose", {
    title: "Collect sanitized diagnostics",
    description: "Trigger bounded diagnostics. Set wait_seconds=0 for parallel work or up to 300 to poll.",
    inputSchema: {
      project_id: z.string(),
      service: z.string().min(1).max(80),
      lines: z.enum(["100", "200", "500"]).default("200"),
      since: z.enum(["15m", "30m", "2h", "1d"]).default("30m"),
      wait_seconds: waitSecondsSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ project_id, service, lines, since, wait_seconds }) => {
    try {
      const project = requireProject(project_id);
      const result = await dispatchAndTrack(project, "diagnose", project.productionBranch, { service, lines, since }, wait_seconds);
      return textResult({ ...result, deploymentMode: modeDetails(project.deploymentMode), inputs: { service, lines, since } });
    } catch (error) { return errorResult(error); }
  });

  server.registerTool("trigger_rollback", {
    title: "Roll back production release",
    description: "Trigger confirmed rollback. Set wait_seconds=0 for parallel work or up to 300 to poll.",
    inputSchema: {
      project_id: z.string(),
      confirm: z.literal("ROLLBACK"),
      release_sha: z.string().max(64).optional(),
      wait_seconds: waitSecondsSchema,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async ({ project_id, confirm, release_sha, wait_seconds }) => {
    try {
      const project = requireProject(project_id);
      const result = await dispatchAndTrack(project, "rollback", project.productionBranch, { confirm, release_sha: release_sha?.trim() ?? "" }, wait_seconds);
      return textResult({ ...result, deploymentMode: modeDetails(project.deploymentMode), releaseSha: release_sha?.trim() || null, warning: "Application rollback may not reverse database migrations." });
    } catch (error) { return errorResult(error); }
  });

  return server;
}
