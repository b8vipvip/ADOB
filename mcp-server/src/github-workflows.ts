import {
  DEFAULT_POLL_INTERVAL_SECONDS,
  MAX_WORKFLOW_WAIT_SECONDS,
  VERSION,
  type Project,
  type WorkflowOperation,
  workflowForOperation,
} from "./config.js";
import { interpretWorkflowRun } from "./workflow-state.js";

export type WorkflowRun = {
  id: number;
  workflow_id?: number;
  run_number?: number;
  run_attempt?: number;
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
  run_started_at?: string | null;
};

type GitHubContent = { type: string; encoding: string; content: string; sha: string };
type WorkflowSelector = { runId?: number; workflowFile?: string; ref?: string; startedAfter?: string };

const githubToken = process.env.GITHUB_TOKEN?.trim() ?? "";

async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!githubToken) throw new Error("GITHUB_TOKEN is not configured on the MCP server");
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": `adob-agents/${VERSION}`,
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
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function readProjectStatus(project: Project): Promise<Record<string, unknown>> {
  const path = `/repos/${project.repo}/contents/${encodePath(project.statusPath)}?ref=${encodeURIComponent(project.statusBranch)}`;
  const file = await githubRequest<GitHubContent>(path);
  if (file.type !== "file" || file.encoding !== "base64") throw new Error(`Unexpected status object for ${project.id}`);
  const value: unknown = JSON.parse(Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid status JSON for ${project.id}`);
  return value as Record<string, unknown>;
}

export async function recentWorkflowRuns(project: Project, limit: number): Promise<WorkflowRun[]> {
  const result = await githubRequest<{ workflow_runs: WorkflowRun[] }>(`/repos/${project.repo}/actions/runs?per_page=${limit}`);
  return result.workflow_runs;
}

async function workflowRunById(project: Project, runId: number): Promise<WorkflowRun> {
  return githubRequest<WorkflowRun>(`/repos/${project.repo}/actions/runs/${runId}`);
}

async function workflowRunsForFile(project: Project, workflowFile: string): Promise<WorkflowRun[]> {
  const workflow = encodeURIComponent(workflowFile);
  const result = await githubRequest<{ workflow_runs: WorkflowRun[] }>(`/repos/${project.repo}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=30`);
  return result.workflow_runs;
}

function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("started_after must be a valid ISO-8601 timestamp");
  return timestamp;
}

function matches(run: WorkflowRun, selector: WorkflowSelector): boolean {
  if (selector.ref && run.head_branch !== selector.ref && run.head_sha !== selector.ref) return false;
  const startedAfter = parseTimestamp(selector.startedAfter);
  return startedAfter === undefined || Date.parse(run.created_at) >= startedAfter - 10_000;
}

async function resolveRun(project: Project, selector: WorkflowSelector): Promise<WorkflowRun | undefined> {
  if (selector.runId !== undefined) return workflowRunById(project, selector.runId);
  if (!selector.workflowFile) throw new Error("Provide run_id or a workflow operation");
  const runs = await workflowRunsForFile(project, selector.workflowFile);
  return runs.filter((run) => matches(run, selector)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

export function summarizeWorkflowRun(run: WorkflowRun) {
  return {
    id: run.id,
    workflowId: run.workflow_id ?? null,
    runNumber: run.run_number ?? null,
    runAttempt: run.run_attempt ?? null,
    name: run.name,
    title: run.display_title,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    url: run.html_url,
    createdAt: run.created_at,
    startedAt: run.run_started_at ?? null,
    updatedAt: run.updated_at,
    lifecycle: interpretWorkflowRun(run),
  };
}

export function workflowStatePolicy() {
  return {
    pendingStatuses: ["queued", "requested", "pending", "waiting", "in_progress"],
    terminalStatus: "completed",
    rule: "Queued and in-progress runs are not failures. Agents may continue independent work and must recheck before dependent actions or final conclusions.",
    maximumSingleWaitSeconds: MAX_WORKFLOW_WAIT_SECONDS,
  };
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function waitForWorkflowRun(project: Project, selector: WorkflowSelector, maxWaitSeconds: number, pollIntervalSeconds: number) {
  const startedAt = Date.now();
  const deadline = startedAt + maxWaitSeconds * 1000;
  let run: WorkflowRun | undefined;
  while (true) {
    run = await resolveRun(project, selector);
    if (run && interpretWorkflowRun(run).terminal) {
      return { found: true, timedOut: false, waitedSeconds: Math.round((Date.now() - startedAt) / 1000), run: summarizeWorkflowRun(run), policy: workflowStatePolicy() };
    }
    const now = Date.now();
    if (now >= deadline) {
      return {
        found: Boolean(run),
        timedOut: true,
        waitedSeconds: Math.round((now - startedAt) / 1000),
        run: run ? summarizeWorkflowRun(run) : null,
        state: run ? interpretWorkflowRun(run).state : "pending_discovery",
        message: run
          ? "The workflow is still non-terminal after the wait window. This is not a failure; continue independent work and recheck later."
          : "The dispatched workflow is not visible yet. GitHub may still be queueing it; this is not a failure. Recheck using the tracking fields.",
        policy: workflowStatePolicy(),
      };
    }
    await sleep(Math.min(pollIntervalSeconds * 1000, deadline - now));
  }
}

async function dispatchWorkflow(project: Project, workflowFile: string, ref: string, inputs: Record<string, string>): Promise<string> {
  const dispatchedAt = new Date().toISOString();
  await githubRequest<void>(`/repos/${project.repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs }),
  });
  return dispatchedAt;
}

export async function dispatchAndTrack(project: Project, operation: WorkflowOperation, ref: string, inputs: Record<string, string>, waitSeconds: number) {
  const workflowFile = workflowForOperation(project, operation);
  const dispatchedAt = await dispatchWorkflow(project, workflowFile, ref, inputs);
  const execution = await waitForWorkflowRun(project, { workflowFile, ref, startedAfter: dispatchedAt }, waitSeconds, 5);
  return {
    accepted: true,
    dispatchState: "accepted",
    project: project.id,
    operation,
    workflow: workflowFile,
    ref,
    dispatchedAt,
    execution,
    tracking: {
      project_id: project.id,
      operation,
      ref,
      started_after: dispatchedAt,
      run_id: execution.run?.id ?? null,
      recheckTool: "wait_for_workflow_run",
      recommendedRecheckSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
      maximumWaitSeconds: MAX_WORKFLOW_WAIT_SECONDS,
    },
  };
}

export async function getWorkflowRun(project: Project, runId: number) {
  return workflowRunById(project, runId);
}
