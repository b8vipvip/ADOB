import { z } from "zod";

export const VERSION = "0.3.0";
export const MAX_WORKFLOW_WAIT_SECONDS = 300;
export const DEFAULT_TRIGGER_WAIT_SECONDS = 0;
export const DEFAULT_POLL_INTERVAL_SECONDS = 15;

export const DeploymentModeSchema = z.enum(["VSR", "GHS"]);
export type DeploymentMode = z.infer<typeof DeploymentModeSchema>;

export const WorkflowOperationSchema = z.enum(["deploy", "diagnose", "rollback"]);
export type WorkflowOperation = z.infer<typeof WorkflowOperationSchema>;

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

export type Project = z.infer<typeof ProjectSchema>;

export const DEPLOYMENT_MODES: Record<DeploymentMode, {
  code: DeploymentMode;
  name: string;
  summary: string;
  executionPlane: string;
  connection: string;
  bestFor: string;
}> = {
  VSR: {
    code: "VSR",
    name: "VPS Self-hosted Runner",
    summary: "GitHub Actions runs the allow-listed workflow on a persistent trusted Runner installed on the VPS.",
    executionPlane: "VPS-hosted GitHub Runner",
    connection: "No deployment SSH hop; the workflow already runs on the VPS.",
    bestFor: "Trusted private VPS environments needing direct deployment and diagnostics.",
  },
  GHS: {
    code: "GHS",
    name: "GitHub-hosted SSH",
    summary: "A GitHub-hosted Runner deploys the exact tested revision through pinned-host-key SSH and rsync.",
    executionPlane: "GitHub-hosted Runner plus VPS deployment script",
    connection: "Pinned SSH/rsync to a dedicated non-root VPS account.",
    bestFor: "Environments that should not keep a persistent GitHub Runner on the VPS.",
  },
};

export function loadProjects(): Project[] {
  const raw = process.env.AUTODEVOPS_PROJECTS_JSON?.trim();
  if (!raw) return [];
  return z.array(ProjectSchema).parse(JSON.parse(raw) as unknown);
}

export const projects = loadProjects();
const projectMap = new Map(projects.map((project) => [project.id, project]));

export function requireProject(projectId: string): Project {
  const project = projectMap.get(projectId);
  if (!project) throw new Error(`Unknown project_id: ${projectId}`);
  return project;
}

export function modeDetails(mode: DeploymentMode) {
  return DEPLOYMENT_MODES[mode];
}

export function workflowForOperation(project: Project, operation: WorkflowOperation): string {
  return project.workflows[operation];
}

export function resolveDeploymentMode(project: Project, requestedMode?: DeploymentMode): DeploymentMode {
  const mode = requestedMode ?? project.deploymentMode;
  if (mode !== project.deploymentMode) {
    throw new Error(`Deployment mode mismatch for ${project.id}: requested ${mode}, configured ${project.deploymentMode}. Update the project registry before switching modes.`);
  }
  return mode;
}
