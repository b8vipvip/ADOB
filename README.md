# ADOB — GPT–GitHub–VPS Automated Development Agent

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

ADOB is an automation agent that connects **GPT, GitHub, and a VPS** into one auditable software-development loop.

- **GPT / ChatGPT / Codex** is the conversational planning and control interface.
- **GitHub** is the source of truth and control plane for branches, pull requests, CI, reviews, workflow dispatches, and audit history.
- **VPS** is the production execution plane for deployment, diagnostics, health checks, and rollback.
- **ADOB MCP server** exposes bounded tools so an AI agent can operate the workflow without receiving unrestricted shell access or private SSH keys.

The intended experience is:

```text
Describe a requirement to GPT
        ↓
Inspect repository, CI and production status
        ↓
Create branch → edit code → test → open pull request
        ↓
Review and merge through GitHub
        ↓
Deploy to VPS with VSR or GHS
        ↓
Verify release SHA, service health and status snapshot
        ↓
Diagnose or roll back through allow-listed workflows when required
```

## What ADOB automates

- Register one or more GitHub repositories as managed projects.
- Let GPT inspect sanitized production status and recent GitHub Actions runs.
- Guide development through branch, implementation, test, review and merge.
- Trigger only allow-listed deployment, diagnostics and rollback workflows.
- Deploy through either a VPS self-hosted Runner or pinned SSH/rsync.
- Verify the deployed commit after production changes.
- Keep production activity visible in GitHub Actions history.
- Require explicit confirmation for destructive rollback actions.

ADOB is not a general-purpose remote shell. Repository text, issues, logs, pull requests and uploaded files are treated as untrusted data rather than instructions.

## Architecture

```text
GPT / ChatGPT / Codex / MCP client
                  │
                  │ bounded MCP tools
                  ▼
        ADOB controller service
                  │
                  │ GitHub API
                  ▼
     GitHub repositories and Actions
          │                   │
          │ VSR               │ GHS
          ▼                   ▼
VPS self-hosted Runner   GitHub-hosted Runner
          │                   │ pinned SSH + rsync
          └──────────┬────────┘
                     ▼
        allow-listed VPS project script
                     │
                     ▼
       deploy → verify → diagnose → rollback
```

## Production execution modes

ADOB has one development lifecycle and two production execution modes. Always use the exact uppercase code.

| Code | Full name | Execution path | Best fit |
|---|---|---|---|
| `VSR` | VPS Self-hosted Runner | GitHub Actions runs directly on a persistent Runner installed on the VPS | A trusted private VPS that needs direct local deployment and diagnostics |
| `GHS` | GitHub-hosted SSH | GitHub-hosted Runner checks out the tested revision and deploys through pinned SSH/rsync | A VPS where no persistent GitHub Runner should remain installed |

`VSR` and `GHS` describe production execution. They are independent from the MCP connection transports `stdio` and `http`.

See [Deployment modes](docs/DEPLOYMENT_MODES.md) for the complete contract.

## Quick server installation

The interactive bootstrap installs Docker when necessary, deploys the ADOB controller, creates a protected configuration file, generates an MCP bearer secret, and can optionally configure the same server as a GHS deployment target.

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

The installer asks for:

- a fine-grained GitHub token;
- the managed repository in `owner/repo` format;
- project ID, name, production branch and `VSR`/`GHS` mode;
- optionally, the GHS deployment public key and deployment directory.

Default installation locations:

```text
Source and compose file: /opt/adob-agent
Protected configuration: /etc/adob-agent/adob.env
MCP endpoint:             http://127.0.0.1:8787/mcp
Health endpoint:          http://127.0.0.1:8787/health
```

The service binds to `127.0.0.1` by default. Put it behind HTTPS before remote use. Do not expose the raw private-test endpoint directly to the public internet.

For non-interactive provisioning and all supported variables, see [Usage, workflow and examples](docs/USAGE.md).

## Local development setup

```bash
cd mcp-server
cp .env.example .env
npm install
npm run check
npm run build
npm start
```

The Streamable HTTP endpoint is `/mcp`; the health endpoint is `/health`.

## Managed-project contract

Each managed repository should contain reviewed workflows and a sanitized status publisher:

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

Workflow filenames are configurable in the project registry.

Example project registration:

```json
{
  "id": "example",
  "name": "Example App",
  "repo": "owner/example",
  "productionBranch": "main",
  "statusBranch": "ops-status",
  "statusPath": "status/status.json",
  "deploymentMode": "GHS",
  "workflows": {
    "deploy": "deploy-production.yml",
    "diagnose": "diagnose-production.yml",
    "rollback": "rollback-production.yml"
  }
}
```

## Example GPT requests

```text
Inspect the example project, its open pull requests, recent CI runs, deployed SHA,
service health and configured deployment mode. Do not change production yet.
```

```text
Fix the login timeout bug in a new branch. Add or update tests, run CI, review the
diff and open a pull request. Do not push directly to main.
```

```text
Deploy the tested main branch of example using GHS. After deployment, verify that
the production SHA matches main and that the health endpoint is healthy.
```

```text
Diagnose the latest failed deployment for example. Collect only sanitized bounded
diagnostics and explain the failed step before proposing a fix.
```

```text
Prepare a rollback of example to commit <SHA>. Explain the application and database
risk first. Execute only after I provide the literal confirmation ROLLBACK.
```

More complete end-to-end scenarios are in [Usage, workflow and examples](docs/USAGE.md).

## Safety model

- No arbitrary `shell`, `ssh`, or `exec` tool is exposed to the model.
- GitHub tokens remain on the ADOB controller.
- GHS private keys remain in the managed repository's GitHub Actions secrets.
- VPS host identity is pinned; `StrictHostKeyChecking` is never disabled.
- Only repository-relative, allow-listed deployment scripts may run.
- Production `.env`, databases, object storage, volumes and backups stay on the VPS.
- Status and diagnostics must be sanitized and bounded.
- Rollback requires literal `ROLLBACK` confirmation.
- Every production action remains auditable through GitHub Actions.

See [Security model](docs/SECURITY.md).

## Documentation

| Topic | English | 简体中文 | 日本語 |
|---|---|---|---|
| Usage, workflow and examples | [Open](docs/USAGE.md) | [打开](docs/zh-CN/USAGE.md) | [開く](docs/ja-JP/USAGE.md) |
| Deployment modes | [Open](docs/DEPLOYMENT_MODES.md) | [打开](docs/zh-CN/DEPLOYMENT_MODES.md) | [開く](docs/ja-JP/DEPLOYMENT_MODES.md) |
| Project/server onboarding | [Open](docs/ONBOARDING.md) | [打开](docs/zh-CN/ONBOARDING.md) | [開く](docs/ja-JP/ONBOARDING.md) |
| GHS SSH deployment | [Open](docs/SSH_TRANSPORT.md) | [打开](docs/zh-CN/SSH_TRANSPORT.md) | [開く](docs/ja-JP/SSH_TRANSPORT.md) |
| Security model | [Open](docs/SECURITY.md) | [打开](docs/zh-CN/SECURITY.md) | [開く](docs/ja-JP/SECURITY.md) |
| Publication checklist | [Open](docs/PUBLICATION.md) | [打开](docs/zh-CN/PUBLICATION.md) | [開く](docs/ja-JP/PUBLICATION.md) |
| Agent operating skill | [Open](skills/autodevops/SKILL.md) | [打开](skills/autodevops/SKILL.zh-CN.md) | [開く](skills/autodevops/SKILL.ja-JP.md) |

## Repository contents

```text
.codex-plugin/plugin.json                 Agent package metadata
.mcp.json                                 Local MCP launch configuration
.github/workflows/deploy-via-ssh.yml      Reusable GHS deployment workflow
skills/autodevops/                        Agent operating policy and prompts
mcp-server/                               Streamable HTTP/stdio MCP controller
installer/bootstrap-server.sh             One-command server bootstrap
installer/install-runner.sh               VSR self-hosted Runner installer
installer/install-ssh-deploy.sh           GHS deployment-user installer
examples/projects.json                    Project registry examples
docs/                                     Architecture, onboarding, security and usage
```

## Current status

The repository provides a private/self-hosted MVP. A public multi-user ChatGPT listing still requires OAuth 2.1, tenant isolation, encrypted token storage, a verified HTTPS service, policies, review assets and platform submission.

## License and attribution

Licensed under the [Apache License 2.0](LICENSE). Modification, redistribution and commercial use are allowed.

Derivative distributions must preserve the license and the attribution notice in [NOTICE](NOTICE), including the original author and source repository:

```text
Original author: b8vipvip
Source: https://github.com/b8vipvip/ADOB
```
