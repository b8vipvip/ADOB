# Using the GPT–GitHub–VPS Automated Development Agent

**English** | [简体中文](zh-CN/USAGE.md) | [日本語](ja-JP/USAGE.md)

This guide explains how ADOB connects a GPT client, GitHub repositories and a VPS; how to install the controller; how a complete development cycle works; and how to phrase safe, effective requests.

## 1. Components and responsibilities

| Component | Responsibility | Secrets kept here |
|---|---|---|
| GPT / ChatGPT / Codex / MCP client | Understand the request, inspect state, plan changes and call bounded tools | No GitHub token or SSH private key |
| ADOB controller | Project allow-list, MCP tools, GitHub API access and deployment-mode enforcement | Fine-grained GitHub token and optional MCP bearer secret |
| GitHub | Source code, branches, Pull Requests, CI, Actions workflows and audit history | GHS SSH private key and exact VPS host key in Actions Secrets |
| VPS | Application runtime, production `.env`, databases, volumes, health checks and deployment scripts | Production application secrets |

The GPT client should never receive unrestricted production credentials.

## 2. Prerequisites

For the controller server:

- Debian or Ubuntu;
- root or `sudo` access;
- outbound access to GitHub and package repositories;
- a fine-grained GitHub token restricted to the repositories ADOB will manage.

For each managed project:

- a GitHub repository;
- CI and allow-listed deployment, diagnostics and rollback workflows;
- a sanitized `ops-status` snapshot;
- either a VSR Runner or a GHS deployment account.

Recommended fine-grained token permissions depend on the enabled tools. Typical private testing requires repository metadata and contents read access plus Actions read/write access for the selected repositories. Grant only the minimum permissions needed.

## 3. Install the ADOB controller on a server

### Interactive installation

Download the script, inspect it, then run it as root:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/bootstrap-server.sh \
  -o /tmp/adob-bootstrap.sh
less /tmp/adob-bootstrap.sh
sudo bash /tmp/adob-bootstrap.sh
```

The script performs these actions:

1. validates Debian/Ubuntu and root privileges;
2. installs `git`, `curl`, `jq`, OpenSSL, Docker and Docker Compose when necessary;
3. securely prompts for the GitHub token;
4. builds one project registry entry or accepts a complete JSON registry;
5. clones the requested ADOB revision into `/opt/adob-agent`;
6. writes secrets to `/etc/adob-agent/adob.env` with mode `600`;
7. builds and starts the MCP controller with Docker Compose;
8. waits for `/health` to become ready;
9. optionally configures the same VPS as a GHS deployment target.

### Important installer variables

| Variable | Default | Meaning |
|---|---|---|
| `ADOB_REF` | `main` | Branch, tag or commit to install |
| `ADOB_SOURCE_DIR` | `/opt/adob-agent` | Managed source and Compose directory |
| `ADOB_CONFIG_DIR` | `/etc/adob-agent` | Protected runtime configuration directory |
| `ADOB_BIND_ADDRESS` | `127.0.0.1` | Host address published by Docker |
| `ADOB_PORT` | `8787` | Host port for MCP and health endpoints |
| `AUTODEVOPS_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Accepted HTTP Host headers |
| `GITHUB_TOKEN_FILE` | empty | File containing the fine-grained GitHub token |
| `AUTODEVOPS_PROJECTS_JSON` | interactive | Complete project registry JSON array |
| `MCP_SHARED_SECRET` | generated | Bearer secret required by the `/mcp` endpoint |
| `CONFIGURE_GHS_TARGET` | `ask` | `true`, `false`, or interactive prompt |

For automated provisioning, store the GitHub token in a root-readable file rather than placing it directly in shell history:

```bash
sudo install -d -m 700 /root/.secrets
sudo sh -c 'umask 077; cat > /root/.secrets/adob-github-token'
```

Then run:

```bash
sudo env \
  GITHUB_TOKEN_FILE=/root/.secrets/adob-github-token \
  PROJECT_REPO=owner/example \
  PROJECT_ID=example \
  PROJECT_NAME='Example App' \
  PRODUCTION_BRANCH=main \
  DEPLOYMENT_MODE=GHS \
  CONFIGURE_GHS_TARGET=false \
  bash /tmp/adob-bootstrap.sh
```

To register multiple projects, provide the complete JSON array through a protected environment file or provisioning system:

```json
[
  {
    "id": "frontend",
    "name": "Frontend",
    "repo": "owner/frontend",
    "productionBranch": "main",
    "statusBranch": "ops-status",
    "statusPath": "status/status.json",
    "deploymentMode": "GHS",
    "workflows": {
      "deploy": "deploy-production.yml",
      "diagnose": "diagnose-production.yml",
      "rollback": "rollback-production.yml"
    }
  },
  {
    "id": "api",
    "name": "API",
    "repo": "owner/api",
    "productionBranch": "main",
    "statusBranch": "ops-status",
    "statusPath": "status/status.json",
    "deploymentMode": "VSR",
    "workflows": {
      "deploy": "deploy-production.yml",
      "diagnose": "diagnose-production.yml",
      "rollback": "rollback-production.yml"
    }
  }
]
```

### Verify and operate the controller

```bash
curl http://127.0.0.1:8787/health
sudo docker compose -f /opt/adob-agent/compose.yaml ps
sudo docker compose -f /opt/adob-agent/compose.yaml logs -f
```

Read the generated MCP bearer secret only when configuring the client:

```bash
sudo sed -n 's/^MCP_SHARED_SECRET=//p' /etc/adob-agent/adob.env
```

Update the installed revision:

```bash
sudo env ADOB_REF=main GITHUB_TOKEN_FILE=/root/.secrets/adob-github-token \
  AUTODEVOPS_PROJECTS_JSON="$(sudo sed -n 's/^AUTODEVOPS_PROJECTS_JSON=//p' /etc/adob-agent/adob.env)" \
  CONFIGURE_GHS_TARGET=false \
  bash /tmp/adob-bootstrap.sh
```

Back up `/etc/adob-agent/adob.env` securely before replacing the server.

## 4. Expose the MCP endpoint safely

The default endpoint is private:

```text
http://127.0.0.1:8787/mcp
```

For a remote MCP client:

1. keep ADOB bound to localhost;
2. place Nginx, Caddy, Traefik or another reviewed reverse proxy in front of it;
3. use a verified domain and valid HTTPS certificate;
4. forward the `Authorization: Bearer <MCP_SHARED_SECRET>` header;
5. set `AUTODEVOPS_ALLOWED_HOSTS` to the exact domain;
6. restrict network access where possible.

The current bearer-secret mode is intended for private testing. A public multi-user service requires OAuth 2.1, PKCE, tenant isolation, encrypted token storage, rate limits and revocation.

## 5. Prepare a managed repository

A managed project normally contains:

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml
scripts/deploy-production.sh
```

The status publisher writes a bounded JSON document to:

```text
ops-status:status/status.json
```

Do not include `.env`, credentials, cookies, private user data, raw database content or unbounded logs in the status snapshot.

### GHS target setup

The bootstrap can optionally call `installer/install-ssh-deploy.sh`. Otherwise run it separately:

```bash
SSH_PUBLIC_KEY="$(cat /secure/path/id_ed25519.pub)" \
DEPLOY_USER=autodevops-deploy \
DEPLOY_DIR=/opt/example \
SSH_HOST=example.com \
SSH_PORT=22 \
sudo -E bash installer/install-ssh-deploy.sh
```

Save the private key and exact printed host-key line as GitHub Actions Secrets. Never paste the private key into GPT or the ADOB controller.

### VSR target setup

VSR needs a short-lived GitHub Runner registration token and the exact Runner archive URL and checksum shown by GitHub:

```bash
export GITHUB_REPOSITORY=owner/example
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/...'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='example-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/example'

sudo -E bash installer/install-runner.sh
```

Do not run untrusted fork workflows on a production VSR Runner.

## 6. Connect a GPT or MCP client

Configure the client with:

```text
URL:           https://your-adob-domain.example/mcp
Authorization: Bearer <MCP_SHARED_SECRET>
```

For local Codex/plugin testing, build the server and use the repository `.mcp.json` configuration.

After connection, begin with read-only calls:

```text
List all registered projects and show each configured deployment mode.
```

```text
Get the current status of example and summarize production SHA, health and warnings.
```

## 7. End-to-end development workflow

### Phase A — Inspect

The agent reads:

- project registry and deployment mode;
- current production status;
- repository branch and open Pull Requests;
- recent CI and deployment runs;
- deployed SHA and service-health warnings.

No production change should occur in this phase.

### Phase B — Develop

The agent should:

1. create or reuse a non-production branch;
2. make the smallest coherent change;
3. add or update tests;
4. avoid unrelated formatting or dependency churn;
5. review the diff for secrets and security impact.

### Phase C — Validate and review

The agent runs available checks, opens a Pull Request and clearly separates verified results from assumptions. A change must not be described as tested unless the checks actually passed.

### Phase D — Merge and deploy

After review and merge, the agent triggers the allow-listed deployment workflow using the project registry's `VSR` or `GHS` mode. It must not silently switch modes.

### Phase E — Verify

The agent re-reads production status and verifies:

- workflow conclusion is successful;
- deployed SHA matches the intended release;
- health checks are passing;
- required services are running;
- no critical disk or memory warning is present.

### Phase F — Diagnose or roll back

If deployment fails, collect bounded diagnostics, identify the failed step and prefer a forward fix. Roll back only when it is safer than repair, and only after the user supplies the literal confirmation `ROLLBACK`.

## 8. Complete request examples

### Read-only project audit

```text
Audit the example project. Read its configured ADOB mode, sanitized production
status, open Pull Requests and ten most recent workflow runs. Report what is
verified, what is inferred and what requires action. Do not change anything.
```

### Implement a feature

```text
Add CSV export to the example admin page. First inspect the current architecture
and tests. Create a new branch, implement the smallest coherent change, add tests,
run the relevant checks, review the diff for security issues and open a Pull
Request. Do not deploy until the Pull Request is reviewed and merged.
```

### Fix a production defect

```text
The example API is returning intermittent 502 responses. Read production status
and recent workflow runs, then collect bounded diagnostics for the API service.
Do not request .env or raw secrets. Identify the likely root cause, implement the
fix on a branch, test it and open a Pull Request.
```

### Deploy a reviewed release

```text
The example main branch has passed CI and the Pull Request is merged. Deploy it
using the configured GHS mode. After the workflow completes, compare the deployed
SHA with main and verify the public and local health checks.
```

### Controlled rollback

```text
Prepare to roll example back to <known-good-sha>. First inspect the current release,
explain whether database migrations may be irreversible and show the exact workflow
that will run. Do not execute until I reply with ROLLBACK.
```

## 9. Common operations

Restart the controller:

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml restart
```

Rebuild after updating source:

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --build
```

Stop the controller:

```bash
sudo docker compose -f /opt/adob-agent/compose.yaml down
```

Rotate the MCP bearer secret:

```bash
new_secret="$(openssl rand -hex 32)"
sudo sed -i "s/^MCP_SHARED_SECRET=.*/MCP_SHARED_SECRET=${new_secret}/" /etc/adob-agent/adob.env
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --force-recreate
```

Rotate a GitHub token by editing `/etc/adob-agent/adob.env`, preserving file mode `600`, then recreating the container.

## 10. Safety checklist

- Keep the controller private or behind HTTPS.
- Use a fine-grained GitHub token restricted to selected repositories.
- Never place GitHub tokens or SSH private keys in GPT messages.
- Keep GHS host-key checking enabled.
- Protect production branches and deployment workflows.
- Keep production data outside uploaded source staging directories.
- Sanitize status and diagnostics.
- Require review and passing CI before deployment.
- Verify the deployed SHA after every production change.
- Preserve the Apache-2.0 license and NOTICE attribution in derivative distributions.
