# ADOB deployment modes: VSR and GHS

ADOB uses one automated development lifecycle and two production execution modes. The mode code is part of the project contract and should always be written in uppercase.

## Canonical names

### VSR — VPS Self-hosted Runner

```text
GitHub Actions
      ↓
Persistent self-hosted Runner on the VPS
      ↓
Allow-listed project deployment script
```

VSR runs the GitHub Actions job directly on the target VPS. There is no separate deployment SSH hop because the Runner already executes inside the production host.

Use VSR when:

- a dedicated trusted Runner can remain installed and online on the VPS;
- direct local diagnostics, status publishing, deployment and rollback jobs are useful;
- the repository is protected from unsafe fork workflows;
- the Runner account and Docker access can be treated as production-level privilege.

Main operational characteristics:

- persistent Runner service on the VPS;
- fastest access to local services and files;
- no GitHub Actions SSH private key required for deployment;
- Runner lifecycle, updates and isolation must be maintained;
- untrusted workflows must never execute on the production Runner.

### GHS — GitHub-hosted SSH

```text
GitHub-hosted Runner
      ↓ exact tested revision
Pinned SSH + rsync
      ↓
Dedicated deployment account on the VPS
      ↓
Allow-listed project deployment script
```

GHS runs the orchestration job on a GitHub-hosted Runner. It checks out the exact tested revision, uploads it to a staging directory outside production, and invokes the project's reviewed deployment script over pinned-host-key SSH.

Use GHS when:

- a persistent GitHub Runner should not remain on the VPS;
- the project can store a dedicated SSH private key and exact host key in GitHub Actions secrets;
- deployment should start from a clean GitHub-hosted Runner;
- direct VPS diagnostics are handled through separate bounded workflows or endpoints.

Main operational characteristics:

- no persistent GitHub Runner service on the VPS;
- exact commit is staged with rsync before deployment;
- dedicated non-root deployment account;
- exact `known_hosts` entry and `StrictHostKeyChecking=yes`;
- `.env`, databases, volumes, object storage and backups remain on the VPS.

## Comparison

| Area | VSR | GHS |
|---|---|---|
| Full name | VPS Self-hosted Runner | GitHub-hosted SSH |
| GitHub job location | Target VPS | GitHub-hosted Runner |
| Deployment connection | No extra SSH hop | Pinned SSH and rsync |
| Persistent VPS agent | Required | Not required |
| GitHub SSH secrets | Not required for deployment | Required |
| Local diagnostics | Direct and convenient | Usually separate bounded workflow/API |
| Main risk boundary | Production Runner executes repository workflows | SSH key, host key and deployment account |
| Best fit | Stable private VPS with trusted Runner | Minimal persistent agent footprint on VPS |

## Project registry declaration

Every project should declare one mode:

```json
{
  "id": "sumeme",
  "repo": "b8vipvip/sumeme",
  "deploymentMode": "GHS"
}
```

Allowed values:

```text
VSR
GHS
```

Unknown values are rejected. When `deploymentMode` is omitted for backward compatibility, the MCP server defaults to `VSR`; production configurations should declare it explicitly.

## ChatGPT wording

Preferred requests:

```text
Deploy sumeme using GHS.
Check the project status and tell me whether it is configured for VSR or GHS.
Diagnose the latest VSR deployment failure.
Switching this project from VSR to GHS requires updating the server-side project registry first.
```

Avoid ambiguous wording such as:

```text
Use the normal mode.
Use remote deployment.
Use runner mode.
```

## MCP calls

Discover the definitions:

```json
{
  "tool": "list_deployment_modes",
  "arguments": {}
}
```

Deploy with an explicit declaration:

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

If `mode` is omitted, ADOB uses the server-side project registry. If `mode` is supplied and does not match the registry, the call fails. This prevents ChatGPT from silently invoking a different production path than the user intended.

## GitHub Actions declarations

### VSR job

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
  steps:
    - uses: actions/checkout@v4
    - name: Deploy exact tested revision
      run: bash scripts/deploy-production.sh "${GITHUB_SHA}"
```

### GHS reusable workflow

```yaml
deploy-production-ghs:
  uses: b8vipvip/ADOB/.github/workflows/deploy-via-ssh.yml@<PINNED_ADOB_SHA>
  with:
    adob_mode: GHS
    project_name: example
    ssh_host: ${{ vars.VPS_HOST }}
    ssh_port: ${{ vars.VPS_PORT || '22' }}
    ssh_user: ${{ vars.VPS_USER }}
    deploy_path: /opt/example
    deploy_script: scripts/deploy-production.sh
  secrets:
    ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
    ssh_host_key: ${{ secrets.SSH_HOST_KEY }}
```

The reusable SSH workflow accepts only `adob_mode: GHS` and rejects any other value.

## Mode changes

A mode change is an infrastructure migration, not a per-request preference. Before switching:

1. update and review the managed repository workflows;
2. provision the required Runner or SSH deployment account;
3. update `deploymentMode` in the MCP project registry;
4. perform one explicit deployment using the new code;
5. verify the deployed SHA, health and sanitized status;
6. disable the old path only after the new path succeeds.

Do not silently fall back between VSR and GHS during one deployment.

## Not the same as MCP transport

These settings are independent:

```text
ADOB deployment mode: VSR | GHS
MCP connection transport: stdio | http
```

`VSR` and `GHS` describe where and how production deployment executes. `stdio` and `http` describe how ChatGPT or Codex connects to the ADOB MCP server.
