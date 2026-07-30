# ADOB — Automated Development Agents for GitHub and VPS

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

ADOB is an **automated development-agent system** that coordinates AI models, GitHub, GitHub Actions, and VPS production environments through one auditable workflow.

Its core is a coordinated group of bounded development agents plus an MCP controller. Together they can:

- inspect repositories, pull requests, CI and sanitized production state;
- implement changes on branches and prepare reviewed pull requests;
- trigger allow-listed GitHub Actions workflows;
- monitor long-running jobs without treating “still running” as failure;
- deploy through VSR or GHS, verify production, diagnose failures and perform confirmed rollback.

Any MCP-capable or GPT-compatible client may be used as the human interaction layer. GitHub remains the source of truth and the VPS remains the production execution plane.

## Agent workflow

```text
Requirement
    ↓
Planning and repository-inspection agents
    ↓
Branch implementation → tests → pull request
    ↓
GitHub review and CI
    ↓
Workflow monitor: queued/running → wait or continue independent work
    ↓
VSR or GHS deployment to VPS
    ↓
Production SHA and health verification
    ↓
Bounded diagnostics or confirmed rollback when required
```

## Long-running GitHub Actions

GitHub Actions may remain queued or running for several minutes. ADOB uses an explicit non-terminal state model:

- `queued`, `requested`, `pending`, `waiting`, and `in_progress` are **not failures**;
- only a run with `status: completed` receives a final success or failure decision;
- trigger tools accept `wait_seconds=0` for immediate return and parallel work;
- trigger tools may poll for up to `300` seconds;
- `wait_for_workflow_run` can recheck a known run ID or rediscover a dispatched workflow later;
- reaching the wait limit returns `still pending`, not failed.

This lets agents continue documentation, code review, test analysis, or another independent task and return to the workflow before any dependent operation or final conclusion.

## Architecture

```text
AI development agents / MCP client
              │ bounded tools
              ▼
       ADOB MCP controller
              │ GitHub API
              ▼
     GitHub repositories and Actions
        │                     │
        │ VSR                 │ GHS
        ▼                     ▼
VPS self-hosted Runner   GitHub-hosted Runner
        │                     │ pinned SSH + rsync
        └──────────┬──────────┘
                   ▼
          allow-listed VPS scripts
                   ▼
       deploy → verify → diagnose → rollback
```

ADOB never exposes an unrestricted remote shell to the model. Repository text, issues, comments, pull requests, logs, and uploaded files are treated as untrusted data.

## Production execution modes

| Code | Full name | Execution path | Best fit |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner | GitHub Actions runs on a persistent trusted Runner installed on the VPS | Private VPS environments needing direct local deployment and diagnostics |
| `GHS` | GitHub-hosted SSH | A GitHub-hosted Runner deploys the tested revision through pinned SSH/rsync | Environments that should not keep a GitHub Runner permanently installed |

`VSR` and `GHS` describe production execution. They are independent from MCP transports such as `stdio` and `http`.

## Quick server installation

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

Default locations:

```text
Source and Compose:      /opt/adob-agent
Protected configuration: /etc/adob-agent/adob.env
MCP endpoint:             http://127.0.0.1:8787/mcp
Health endpoint:          http://127.0.0.1:8787/health
```

The service binds to localhost by default. Put it behind an authenticated HTTPS reverse proxy before remote use.

## Quick GitHub repository onboarding

Run the repository wizard from a clean local checkout:

```bash
gh auth login

curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/setup-managed-repo.sh \
  -o /tmp/setup-managed-repo.sh

bash /tmp/setup-managed-repo.sh
```

The wizard can create an onboarding branch, generate CI/deploy/diagnose/rollback/status workflows, set Actions Variables, upload GHS Secrets from protected files, write `.adob-project.json`, and open a draft pull request.

## MCP workflow tools

Read and tracking tools:

- `list_projects`
- `get_project_status`
- `get_recent_workflow_runs`
- `get_workflow_run`
- `wait_for_workflow_run`

Production tools:

- `trigger_deploy`
- `trigger_diagnose`
- `trigger_rollback`

Example fire-and-continue deployment:

```json
{
  "project_id": "example",
  "mode": "GHS",
  "ref": "main",
  "wait_seconds": 0
}
```

Example bounded synchronous wait:

```json
{
  "project_id": "example",
  "run_id": 123456789,
  "max_wait_seconds": 300,
  "poll_interval_seconds": 15
}
```

## Managed repository contract

A managed project normally contains:

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml
scripts/deploy-production.sh
scripts/diagnose-production.sh
scripts/rollback-production.sh
scripts/publish-status.sh
```

Sanitized production status is published to:

```text
ops-status:status/status.json
```

## Safety model

- No arbitrary `shell`, `ssh`, or `exec` MCP tool.
- GitHub tokens remain on the ADOB controller.
- GHS private keys remain in GitHub Actions Secrets.
- VPS host identity is pinned; `StrictHostKeyChecking` is never disabled.
- Only reviewed, repository-relative allow-listed scripts may run.
- Production `.env`, databases, volumes, uploads and backups remain on the VPS.
- Diagnostics are bounded and sanitized.
- Rollback requires literal `ROLLBACK` confirmation.
- Pending Actions are never misreported as failed.

## Documentation

| Topic | English | 简体中文 | 日本語 |
|---|---|---|---|
| Usage and examples | [Open](docs/USAGE.md) | [打开](docs/zh-CN/USAGE.md) | [開く](docs/ja-JP/USAGE.md) |
| Workflow waiting and concurrency | [Open](docs/WORKFLOW_WAITING.md) | [打开](docs/zh-CN/WORKFLOW_WAITING.md) | [開く](docs/ja-JP/WORKFLOW_WAITING.md) |
| Detailed GitHub setup | [Open](docs/GITHUB_SETUP.md) | [打开](docs/zh-CN/GITHUB_SETUP.md) | [開く](docs/ja-JP/GITHUB_SETUP.md) |
| Deployment modes | [Open](docs/DEPLOYMENT_MODES.md) | [打开](docs/zh-CN/DEPLOYMENT_MODES.md) | [開く](docs/ja-JP/DEPLOYMENT_MODES.md) |
| Project/server onboarding | [Open](docs/ONBOARDING.md) | [打开](docs/zh-CN/ONBOARDING.md) | [開く](docs/ja-JP/ONBOARDING.md) |
| Security model | [Open](docs/SECURITY.md) | [打开](docs/zh-CN/SECURITY.md) | [開く](docs/ja-JP/SECURITY.md) |
| Production readiness | [Open](docs/PUBLICATION.md) | [打开](docs/zh-CN/PUBLICATION.md) | [開く](docs/ja-JP/PUBLICATION.md) |

## Repository contents

```text
.mcp.json                                 Local MCP launch configuration
skills/autodevops/                        Agent operating policy
mcp-server/                               MCP controller and workflow tracker
installer/bootstrap-server.sh             Server bootstrap
installer/setup-managed-repo.sh           Managed-repository onboarding wizard
templates/managed-repo/                   Workflow and adapter templates
docs/                                     Architecture, setup, safety and operations
```

## License and attribution

Licensed under the [Apache License 2.0](LICENSE). Modification, redistribution, derivative development, and commercial use are allowed. Derivative distributions must preserve the license and the attribution notice in [NOTICE](NOTICE).

```text
Original author: b8vipvip
Source: https://github.com/b8vipvip/ADOB
```
