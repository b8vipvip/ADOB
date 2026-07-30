# Workflow waiting, polling, and parallel agent work

[English](WORKFLOW_WAITING.md) | [简体中文](zh-CN/WORKFLOW_WAITING.md) | [日本語](ja-JP/WORKFLOW_WAITING.md)

GitHub Actions often needs time to obtain a Runner, install dependencies, build images, transfer releases, or wait for an environment gate. ADOB must not treat a non-terminal run as a failed or blocked task.

## State policy

| GitHub status/conclusion | ADOB interpretation | Agent behavior |
|---|---|---|
| `queued`, `requested`, `pending`, `waiting` | queued, non-terminal | Wait or continue independent work |
| `in_progress` | running, non-terminal | Wait or continue independent work |
| `completed` + `success` | succeeded | Continue dependent work |
| `completed` + `failure`, `cancelled`, `timed_out`, `action_required`, `startup_failure`, `stale` | failed | Inspect logs and diagnose |
| `completed` + `neutral` or `skipped` | terminal non-failure | Evaluate whether the skipped result satisfies the dependency |

Only `status: completed` is terminal.

## Two operating patterns

### Fire, continue, and recheck

Use `wait_seconds: 0` when the Agent has useful independent work available:

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 0
}
```

The trigger response contains tracking fields such as `run_id`, `operation`, `ref`, and `started_after`. The Agent may then review code, update documentation, prepare release notes, or inspect another independent project.

Before any dependent action or final statement, recheck:

```json
{
  "project_id": "example",
  "run_id": 123456789,
  "max_wait_seconds": 300,
  "poll_interval_seconds": 15
}
```

If the run ID was not visible immediately after dispatch, use the operation and tracking timestamp:

```json
{
  "project_id": "example",
  "operation": "deploy",
  "ref": "main",
  "started_after": "2026-07-30T10:00:00.000Z",
  "max_wait_seconds": 300,
  "poll_interval_seconds": 15
}
```

### Bounded synchronous wait

Set `wait_seconds` between `1` and `300` on a trigger tool when the next step directly depends on the result:

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 300
}
```

If the workflow remains non-terminal after five minutes, ADOB returns a pending state. It does not return a workflow failure.

## Agent rules

1. Do not infer failure from the absence of an immediate completed result.
2. Record the tracking object returned by every trigger.
3. Continue only work that does not depend on the pending run.
4. Recheck before deployment verification, merge decisions, rollback decisions, or final reporting.
5. Do not dispatch a duplicate workflow merely because the first run is queued or in progress.
6. Call a run failed only when GitHub reports a terminal failure conclusion.
7. If a run remains pending unusually long, report the elapsed state and inspect Runner availability, concurrency, environment approvals, or GitHub service status.

## Why the maximum is five minutes

A single MCP request should remain bounded. Five minutes is long enough for many CI and deployment jobs to complete while avoiding an indefinitely open request. Longer jobs should use the fire-and-recheck pattern.
