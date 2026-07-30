# AutoDevOps Bridge (ADOB)

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

AutoDevOps Bridge is a reusable ChatGPT/Codex plugin for operating self-hosted software projects through auditable, allow-listed GitHub workflows.

## Canonical deployment modes

ADOB has one development lifecycle and two production execution modes. Always use the exact uppercase mode code when configuring a project or asking ChatGPT to deploy it.

| Code | Full name | Execution path | Main requirement |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner | GitHub Actions → persistent Runner on the VPS → project script | A trusted self-hosted Runner remains installed and online on the VPS |
| `GHS` | GitHub-hosted SSH | GitHub-hosted Runner → pinned SSH/rsync → VPS project script | Dedicated SSH key and exact VPS host key stored in GitHub Actions secrets |

```text
ChatGPT / Codex
       │
       ▼
AutoDevOps MCP server
       │ GitHub API
       ▼
Managed repository workflows
       │
       ├─ VSR: VPS Self-hosted Runner
       │
       └─ GHS: GitHub-hosted Runner → pinned SSH/rsync → VPS
```

`VSR` and `GHS` describe production execution. They are separate from the MCP connection transports `stdio` and `http`.

See `docs/DEPLOYMENT_MODES.md` for the full comparison and declaration rules.

## How to declare a mode

Project registry:

```json
{
  "id": "sumeme",
  "repo": "b8vipvip/sumeme",
  "deploymentMode": "GHS"
}
```

Natural-language request:

```text
Deploy the sumeme project using GHS mode.
```

MCP tool call:

```json
{
  "tool": "trigger_deploy",
  "arguments": {
    "project_id": "sumeme",
    "mode": "GHS",
    "ref": "main"
  }
}
```

The `mode` argument is optional and defaults to the server-side project registry. When supplied, it must match the configured project mode; ADOB rejects a mismatched declaration instead of silently using another execution path.

The read-only `list_deployment_modes` tool returns the canonical definitions, and project/status tools include the configured mode in their output.

## What the current version supports

- Register one or more GitHub repositories as projects.
- Declare each project's production mode as `VSR` or `GHS`.
- Read a sanitized production snapshot from an `ops-status` branch.
- Inspect recent GitHub Actions runs.
- Trigger an allow-listed deployment workflow.
- Trigger an allow-listed diagnostic workflow.
- Trigger rollback only with an explicit `ROLLBACK` confirmation value.
- Use either a VPS self-hosted Runner or ADOB's reusable GitHub-hosted SSH deployment workflow.
- Give ChatGPT a reusable skill that enforces the safe sequence: inspect → branch → change → test → review → merge → deploy → verify.

## Repository contents

```text
.codex-plugin/plugin.json                 Plugin package metadata
.mcp.json                                 Local Codex MCP launch configuration
.github/workflows/deploy-via-ssh.yml      Reusable GHS deployment workflow
skills/autodevops/SKILL.md                Operating policy and mode vocabulary
skills/autodevops/SKILL.zh-CN.md          Simplified Chinese skill documentation
skills/autodevops/SKILL.ja-JP.md          Japanese skill documentation
mcp-server/                               Streamable HTTP/stdio MCP service
installer/install-runner.sh               VSR self-hosted Runner installer
installer/install-ssh-deploy.sh           GHS deployment-user installer
examples/projects.json                    Project registry examples
docs/DEPLOYMENT_MODES.md                  Canonical VSR/GHS contract
docs/SSH_TRANSPORT.md                     GHS setup and caller contract
docs/                                     English security, onboarding, and publication docs
docs/zh-CN/                               Simplified Chinese documentation
docs/ja-JP/                               Japanese documentation
```

## Local single-user setup

The initial implementation is suitable for private testing. It uses a GitHub fine-grained token stored only on the MCP server.

```bash
cd mcp-server
cp .env.example .env
npm install
npm run build
npm start
```

The Streamable HTTP endpoint is `/mcp`; the health endpoint is `/health`.

## Required managed-repository convention

Each managed repository should contain allow-listed workflow files and publish a sanitized status snapshot:

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml

ops-status branch:
  status/status.json
  status/STATUS.md
```

Workflow names are configurable per project.

For `GHS`, call the reusable SSH workflow with an explicit declaration:

```yaml
uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
with:
  adob_mode: GHS
  project_name: example
  ssh_host: ${{ vars.VPS_HOST }}
  ssh_user: ${{ vars.VPS_USER }}
  deploy_path: /opt/example
```

For `VSR`, make the mode visible in the self-hosted job:

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
  steps:
    - uses: actions/checkout@v4
    - run: bash scripts/deploy-production.sh "${GITHUB_SHA}"
```

## Safety principles

- No arbitrary shell tool exposed to the model.
- No SSH private keys in ChatGPT, Codex, the MCP service, repository source, issues, or logs.
- GHS secrets stay in the managed project's GitHub Actions secret store.
- GHS pins the VPS host identity; `StrictHostKeyChecking` is never disabled.
- Deploy only a tested commit or trusted branch.
- Run only a repository-relative, allow-listed project deployment script.
- Read sanitized status instead of `.env` or unrestricted logs.
- Destructive actions require explicit confirmation.
- Every action remains visible in GitHub Actions history.

See `docs/ONBOARDING.md`, `docs/DEPLOYMENT_MODES.md`, `docs/SECURITY.md`, `docs/SSH_TRANSPORT.md`, and `docs/PUBLICATION.md`.

## Status

This repository contains the private-test MVP. Public ChatGPT directory publication still requires OAuth 2.1, tenant isolation, a verified HTTPS service, policies, review assets, and developer submission.

## License

MIT. Upstream project and service licenses remain separate.
