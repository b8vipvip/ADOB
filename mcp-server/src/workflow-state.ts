export type WorkflowRunLike = {
  id: number;
  status: string;
  conclusion: string | null;
};

export type WorkflowLifecycleState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "completed"
  | "unknown";

export type WorkflowLifecycle = {
  state: WorkflowLifecycleState;
  terminal: boolean;
  successful: boolean | null;
  shouldWait: boolean;
  message: string;
};

const QUEUED_STATUSES = new Set(["queued", "requested", "pending", "waiting"]);
const RUNNING_STATUSES = new Set(["in_progress"]);
const FAILURE_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
]);
const NON_FAILURE_CONCLUSIONS = new Set(["neutral", "skipped"]);

export function interpretWorkflowRun(run: WorkflowRunLike): WorkflowLifecycle {
  const status = run.status.toLowerCase();
  const conclusion = run.conclusion?.toLowerCase() ?? null;

  if (QUEUED_STATUSES.has(status)) {
    return {
      state: "queued",
      terminal: false,
      successful: null,
      shouldWait: true,
      message: "The workflow is queued or waiting. This is not a failure; continue independent work or check again later.",
    };
  }

  if (RUNNING_STATUSES.has(status)) {
    return {
      state: "running",
      terminal: false,
      successful: null,
      shouldWait: true,
      message: "The workflow is still running. This is not a failure; continue independent work or check again later.",
    };
  }

  if (status === "completed") {
    if (conclusion === "success") {
      return {
        state: "succeeded",
        terminal: true,
        successful: true,
        shouldWait: false,
        message: "The workflow completed successfully.",
      };
    }

    if (conclusion && FAILURE_CONCLUSIONS.has(conclusion)) {
      return {
        state: "failed",
        terminal: true,
        successful: false,
        shouldWait: false,
        message: `The workflow completed with conclusion: ${conclusion}.`,
      };
    }

    if (conclusion && NON_FAILURE_CONCLUSIONS.has(conclusion)) {
      return {
        state: "completed",
        terminal: true,
        successful: true,
        shouldWait: false,
        message: `The workflow completed with non-failure conclusion: ${conclusion}.`,
      };
    }

    return {
      state: "completed",
      terminal: true,
      successful: null,
      shouldWait: false,
      message: "The workflow completed, but GitHub did not provide a recognized conclusion.",
    };
  }

  return {
    state: "unknown",
    terminal: false,
    successful: null,
    shouldWait: true,
    message: `The workflow has status '${run.status}'. Treat it as non-terminal until GitHub reports completion.`,
  };
}
