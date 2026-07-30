# Onboarding another project or server

AutoDevOps Bridge separates one-time privileged onboarding from ongoing automated operation.

## Choose the deployment mode first

Every managed project must declare one canonical ADOB deployment mode:

- `VSR` — VPS Self-hosted Runner;
- `GHS` — GitHub-hosted SSH.

Do not use vague substitutes such as local, remote, normal or runner mode. Record the exact uppercase code in the project registry and managed workflows. See `DEPLOYMENT_MODES.md` before choosing.

## One-time actions common to both modes

1. Select or create the GitHub repository.
2. Add reviewed CI, deployment, diagnosis, rollback and status workflows.
3. Configure the project's production `.env` directly on the server.
4. Publish a sanitized status snapshot to `ops-status`.
5. Register the project in `AUTODEVOPS_PROJECTS_JSON` with `deploymentMode: "VSR"` or `deploymentMode: "GHS"`.
6. Verify one deployment and compare deployed SHA with the production branch SHA.

## VSR onboarding

Choose VSR when a persistent trusted GitHub Runner will remain on the VPS.

1. Keep the managed repository private when the production Runner has broad local access.
2. Create a dedicated non-root Runner account.
3. Obtain a short-lived GitHub Runner registration token.
4. Run `installer/install-runner.sh` on the server.
5. Configure the production job with a VSR declaration:

```yaml
deploy-production-vsr:
  runs-on: [self-hosted, linux, x64, production]
  env:
    ADOB_MODE: VSR
```

Use the current archive URL and SHA256 displayed by GitHub under:

```text
Repository → Settings → Actions → Runners → New self-hosted runner
```

Installer example:

```bash
export GITHUB_REPOSITORY=owner/repository
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/.../actions-runner-linux-x64-....tar.gz'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='project-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/project'

bash installer/install-runner.sh
```

The installer securely prompts for the short-lived Runner token when `RUNNER_TOKEN` is not already set.

## GHS onboarding

Choose GHS when deployment will originate from a GitHub-hosted Runner over pinned SSH/rsync.

1. Create or select a dedicated non-root VPS deployment account.
2. Generate a dedicated SSH key pair in an authorized administrative session.
3. Install the public key with `installer/install-ssh-deploy.sh`.
4. Save the private key and exact host-key line in the managed repository's GitHub Actions secrets.
5. Call the reusable workflow with `adob_mode: GHS`.
6. Pin the ADOB workflow to a reviewed commit SHA or release tag.

See `SSH_TRANSPORT.md` for the complete GHS procedure.

## Project registry entry

```json
{
  "id": "project-id",
  "name": "Project Name",
  "repo": "owner/repository",
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

The mode is enforced by the MCP server. Calling `trigger_deploy` with a different mode is rejected until the server-side registry is changed.

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

## Ongoing workflow

```text
Discuss requirement in ChatGPT mobile/web
          ↓
ChatGPT reads project status and configured VSR/GHS mode
          ↓
Creates a branch and implements the change
          ↓
GitHub-hosted CI validates it
          ↓
Reviewed change enters the production branch
          ↓
VSR or GHS executes the allow-listed deployment workflow
          ↓
Status publisher updates ops-status
          ↓
ChatGPT verifies deployed SHA, health and mode
```

## Changing modes

Switching between VSR and GHS is an infrastructure migration, not a one-off deployment option.

1. Provision the new execution path.
2. Update managed workflows.
3. Update `deploymentMode` in the MCP project registry.
4. Perform one explicit deployment using the new code.
5. Verify health and deployed SHA.
6. Disable the old path only after the new one succeeds.

Never silently fall back from one mode to the other.

## Boundaries

The plugin cannot safely automate ownership proofs, account verification, CAPTCHA, payment, domain registrar access or the initial privileged installation without an authorized human or server bootstrap mechanism. It should identify these as one-time user actions rather than requesting routine SSH log copying.
