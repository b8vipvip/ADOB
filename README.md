# AutoDevOps Bridge (ADOB)

AutoDevOps Bridge is a reusable ChatGPT/Codex plugin for operating self-hosted software projects through GitHub Actions and self-hosted runners.

It deliberately **does not expose SSH, root credentials, or an unrestricted shell** to the model. ChatGPT works through auditable, allow-listed GitHub workflows instead:

```text
ChatGPT / Codex
       │
       ▼
AutoDevOps MCP server
       │ GitHub API
       ▼
Repository workflows
       │
       ▼
Self-hosted GitHub Runner on the VPS
       │
       ├─ deploy
       ├─ diagnose
       ├─ publish sanitized status
       └─ rollback
```

## What the first version supports

- Register one or more GitHub repositories as projects.
- Read a sanitized production snapshot from an `ops-status` branch.
- Inspect recent GitHub Actions runs.
- Trigger an allow-listed deployment workflow.
- Trigger an allow-listed diagnostic workflow.
- Trigger rollback only with an explicit `ROLLBACK` confirmation value.
- Give ChatGPT a reusable skill that enforces the safe development sequence: inspect → branch → change → test → review → merge → deploy → verify.

## Repository contents

```text
.codex-plugin/plugin.json   Plugin package metadata
.mcp.json                   Local Codex MCP launch configuration
skills/autodevops/SKILL.md  Operating policy and workflow instructions
mcp-server/                 Streamable HTTP MCP service
installer/                  One-time self-hosted Runner installer
examples/projects.json      Project registry example
docs/                       Security, onboarding and publication docs
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

## Safety principles

- No arbitrary shell tool.
- No SSH private keys in ChatGPT or the MCP service.
- Deploy only a tested commit or trusted branch.
- Read sanitized status instead of `.env` or unrestricted logs.
- Destructive actions require explicit confirmation.
- Every action remains visible in GitHub Actions history.

See `docs/ONBOARDING.md`, `docs/SECURITY.md`, and `docs/PUBLICATION.md`.

## Status

This repository contains the private-test MVP. Public ChatGPT directory publication still requires OAuth 2.1, tenant isolation, a verified HTTPS service, policies, review assets, and developer submission.

## License

MIT. Upstream project and service licenses remain separate.
