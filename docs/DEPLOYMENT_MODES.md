# ADOB deployment modes: VSR and GHS

[English](DEPLOYMENT_MODES.md) | [简体中文](zh-CN/DEPLOYMENT_MODES.md) | [日本語](ja-JP/DEPLOYMENT_MODES.md)

ADOB automated development agents use one development lifecycle and two production execution modes. Always use the exact uppercase code.

## VSR — VPS Self-hosted Runner

```text
GitHub Actions
      ↓
Persistent trusted Runner on the VPS
      ↓
Allow-listed project script
```

Use VSR when direct local deployment and diagnostics are useful and the production Runner can be isolated from untrusted workflows.

Characteristics:

- persistent Runner service on the VPS;
- no separate deployment SSH hop;
- fast access to local Docker and services;
- Runner lifecycle and updates must be maintained;
- Runner privileges must be treated as production-level access.

## GHS — GitHub-hosted SSH

```text
GitHub-hosted Runner
      ↓ exact tested revision
Pinned SSH + rsync
      ↓
Dedicated non-root VPS deployment account
      ↓
Allow-listed project script
```

Use GHS when no persistent GitHub Runner should remain on the VPS.

Characteristics:

- clean GitHub-hosted execution environment;
- dedicated SSH key and exact host-key pinning;
- source staged outside production before deployment;
- `.env`, databases, uploads, volumes and backups remain on the VPS;
- `StrictHostKeyChecking=yes` is mandatory.

## Comparison

| Area | VSR | GHS |
|---|---|---|
| Job location | Target VPS | GitHub-hosted Runner |
| Persistent VPS Runner | Required | Not required |
| Deployment SSH key | Not required | Required |
| Local diagnostics | Direct through reviewed workflows | Through bounded SSH workflow |
| Main security boundary | Production Runner permissions | SSH key, host key and deployment account |

## Project declaration

```json
{
  "id": "example",
  "repo": "owner/example",
  "deploymentMode": "GHS"
}
```

Allowed values:

```text
VSR
GHS
```

A trigger that explicitly requests a mode different from the registry is rejected.

## Agent request wording

Preferred:

```text
Deploy example using its configured GHS mode.
Check whether the project is configured for VSR or GHS.
Diagnose the latest VSR deployment failure.
```

Avoid ambiguous phrases such as “normal mode,” “remote mode,” or “runner mode.”

## Waiting is independent from deployment mode

Both VSR and GHS workflows may queue or run for several minutes. `queued`, `waiting`, and `in_progress` are non-terminal in both modes. Agents may wait up to 300 seconds or continue independent work and recheck later with `wait_for_workflow_run`.

## Mode changes

Switching modes is an infrastructure migration:

1. provision the new Runner or SSH account;
2. update and review workflows;
3. update `deploymentMode` in the controller registry;
4. deploy once using the new mode;
5. wait for terminal workflow status and verify production;
6. disable the old path only after success.

## Not the same as MCP transport

```text
ADOB deployment mode: VSR | GHS
MCP transport:         stdio | http
```
