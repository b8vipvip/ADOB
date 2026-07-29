# AutoDevOps Bridge (ADOB)

[![CI](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml/badge.svg)](https://github.com/b8vipvip/ADOB/actions/workflows/ci.yml)

AutoDevOps Bridge is a reusable ChatGPT/Codex plugin for operating self-hosted software projects through auditable, allow-listed GitHub workflows.

ADOB supports two production execution transports:

```text
ChatGPT / Codex
       │
       ▼
AutoDevOps MCP server
       │ GitHub API
       ▼
Managed repository workflows
       │
       ├─ self-hosted Runner on the VPS
       │
       └─ GitHub-hosted Runner → pinned SSH/rsync → VPS
```

The model never receives an unrestricted shell. With SSH transport, the private key remains in the managed repository's GitHub Actions secrets and is not stored in ChatGPT, Codex, the ADOB MCP service, source control, issues, or logs.

## What the first version supports

- Register one or more GitHub repositories as projects.
- Read a sanitized production snapshot from an `ops-status` branch.
- Inspect recent GitHub Actions runs.
- Trigger an allow-listed deployment workflow.
- Trigger an allow-listed diagnostic workflow.
- Trigger rollback only with an explicit `ROLLBACK` confirmation value.
- Use either a VPS self-hosted Runner or ADOB's reusable GitHub-hosted SSH deployment transport.
- Give ChatGPT a reusable skill that enforces the safe development sequence: inspect → branch → change → test → review → merge → deploy → verify.

## Repository contents

```text
.codex-plugin/plugin.json                 Plugin package metadata
.mcp.json                                 Local Codex MCP launch configuration
.github/workflows/deploy-via-ssh.yml      Reusable GitHub-hosted SSH deploy job
skills/autodevops/SKILL.md                Operating policy and workflow instructions
mcp-server/                               Streamable HTTP MCP service
installer/install-runner.sh               Self-hosted Runner installer
installer/install-ssh-deploy.sh           SSH deployment-user installer
examples/projects.json                    Project registry example
docs/SSH_TRANSPORT.md                     SSH transport setup and caller contract
docs/                                      Security, onboarding and publication docs
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

Workflow names are configurable per project. Projects using SSH transport may call ADOB's reusable workflow from their CI after tests succeed.

## Safety principles

- No arbitrary shell tool exposed to the model.
- No SSH private keys in ChatGPT, Codex, the MCP service, repository source, issues, or logs.
- SSH secrets stay in the managed project's GitHub Actions secret store.
- Host identity is pinned; `StrictHostKeyChecking` is never disabled.
- Deploy only a tested commit or trusted branch.
- Run only a repository-relative, allow-listed project deployment script.
- Read sanitized status instead of `.env` or unrestricted logs.
- Destructive actions require explicit confirmation.
- Every action remains visible in GitHub Actions history.

See `docs/ONBOARDING.md`, `docs/SECURITY.md`, `docs/SSH_TRANSPORT.md`, and `docs/PUBLICATION.md`.

## Status

This repository contains the private-test MVP. Public ChatGPT directory publication still requires OAuth 2.1, tenant isolation, a verified HTTPS service, policies, review assets, and developer submission.

## License

MIT. Upstream project and service licenses remain separate.
