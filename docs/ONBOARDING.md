# Onboarding another project or server

AutoDevOps Bridge separates one-time privileged onboarding from ongoing automated operation.

## One-time actions

A new project/server requires these actions once:

1. Select or create the GitHub repository.
2. Keep the repository private if its self-hosted runner has production privileges.
3. Add reviewed CI, deployment, diagnosis, rollback and status workflows.
4. Create a dedicated non-root runner account on the server.
5. Obtain a short-lived GitHub runner registration token.
6. Run `installer/install-runner.sh` on the server.
7. Configure the project's production `.env` directly on the server.
8. Register the project in the MCP server's `AUTODEVOPS_PROJECTS_JSON`.

After this, ChatGPT does not need SSH credentials.

## Installer example

Use the current archive URL and SHA256 displayed by GitHub under:

```text
Repository → Settings → Actions → Runners → New self-hosted runner
```

Then run on the server as root:

```bash
export GITHUB_REPOSITORY=owner/repository
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/.../actions-runner-linux-x64-....tar.gz'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='project-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/project'

bash installer/install-runner.sh
```

The installer securely prompts for the short-lived runner token when `RUNNER_TOKEN` is not already set.

## Recommended GitHub repository variables

```text
AUTODEVOPS_DEPLOY_DIR=/opt/project
AUTODEVOPS_RUNNER_LABEL=autodevops-production
AUTODEVOPS_PUBLIC_HEALTH_URL=https://project.example/health
```

Secrets stay in the server's protected `.env`, not in the repository.

## Repository contract

The plugin expects the project to expose these reviewed workflows, though filenames can be changed in the registry:

```text
deploy-production.yml
diagnose-production.yml
rollback-production.yml
publish-status.yml
```

The status publisher writes a sanitized JSON document to:

```text
ops-status:status/status.json
```

A project adapter may use Docker Compose, systemd, Kubernetes or another runtime, provided the workflows keep the same safe contract.

## Project registry entry

```json
{
  "id": "project-id",
  "name": "Project Name",
  "repo": "owner/repository",
  "productionBranch": "main",
  "statusBranch": "ops-status",
  "statusPath": "status/status.json",
  "workflows": {
    "deploy": "deploy-production.yml",
    "diagnose": "diagnose-production.yml",
    "rollback": "rollback-production.yml"
  }
}
```

## Ongoing workflow

```text
Discuss requirement in ChatGPT mobile/web
          ↓
ChatGPT inspects project status and repository
          ↓
Creates a branch and implements the change
          ↓
GitHub-hosted CI validates it
          ↓
Reviewed change enters production branch
          ↓
Self-hosted runner deploys the trusted release
          ↓
Status publisher updates ops-status
          ↓
ChatGPT verifies the deployed SHA and health
```

## Boundaries

The plugin cannot safely automate ownership proofs, account verification, CAPTCHA, payment, domain registrar access, or the initial privileged installation without an authorized human or server bootstrap mechanism. It should identify these as one-time user actions rather than requesting routine SSH log copying.
