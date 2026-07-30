# Onboarding another project or server

[English](ONBOARDING.md) | [简体中文](zh-CN/ONBOARDING.md) | [日本語](ja-JP/ONBOARDING.md)

ADOB automated development agents separate one-time privileged onboarding from ongoing bounded operation.

## Recommended onboarding path

1. Install the ADOB controller with `installer/bootstrap-server.sh`.
2. Clone the target project locally and run `installer/setup-managed-repo.sh`.
3. Review and merge the generated onboarding pull request.
4. Configure VSR or GHS infrastructure.
5. Add `.adob-project.json` to the controller project registry.
6. Run CI, publish status, deploy a test release, and verify the deployed SHA.

## Choose the deployment mode

- `VSR` — VPS Self-hosted Runner.
- `GHS` — GitHub-hosted SSH.

Use the exact uppercase code in the project registry and managed workflows. Switching modes is an infrastructure migration, not a per-request preference.

## Common one-time actions

1. Protect the production branch and require CI.
2. Add reviewed CI, deploy, diagnose, rollback and status workflows.
3. Configure production `.env` directly on the VPS.
4. Publish a sanitized status snapshot to `ops-status`.
5. Register the project in `AUTODEVOPS_PROJECTS_JSON`.
6. Test workflow waiting behavior: queued/running must remain pending.
7. Verify one deployment and compare production SHA with the intended revision.

## VSR onboarding

Use VSR when a persistent trusted GitHub Runner may remain on the VPS.

```bash
export GITHUB_REPOSITORY=owner/repository
export RUNNER_ARCHIVE_URL='https://github.com/actions/runner/releases/download/...'
export RUNNER_ARCHIVE_SHA256='sha256-from-github'
export RUNNER_NAME='project-production-vps'
export RUNNER_LABELS='autodevops-production'
export DEPLOY_DIR='/opt/project'

sudo -E bash installer/install-runner.sh
```

Obtain the current archive URL, checksum and short-lived registration token from:

```text
Repository → Settings → Actions → Runners → New self-hosted runner
```

Do not allow untrusted fork workflows to execute on a production Runner.

## GHS onboarding

Use GHS when deployment should originate from a GitHub-hosted Runner over pinned SSH/rsync.

1. Generate a dedicated SSH key pair.
2. Install the public key with `installer/install-ssh-deploy.sh`.
3. Save the private key as `SSH_PRIVATE_KEY` in GitHub Actions Secrets.
4. Save the exact host-key line as `SSH_HOST_KEY`.
5. Configure `VPS_HOST`, `VPS_PORT`, `VPS_USER` and `DEPLOY_PATH` Variables.
6. Pin reusable ADOB workflows to a reviewed commit SHA or release tag.

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

## Repository contract

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

The status publisher writes sanitized state to:

```text
ops-status:status/status.json
```

## Ongoing agent workflow

```text
Requirement enters ADOB agents
        ↓
Agents inspect repository, CI and production state
        ↓
Branch implementation and pull request
        ↓
CI may queue or run; agents wait or continue independent work
        ↓
Reviewed change enters the production branch
        ↓
VSR or GHS runs the allow-listed deployment
        ↓
Agents wait for terminal Actions status
        ↓
Status publisher updates ops-status
        ↓
Agents verify deployed SHA and health
```

## Changing modes

1. Provision the new Runner or SSH path.
2. Update and review managed workflows.
3. Update `deploymentMode` in the controller registry.
4. Perform one explicit deployment.
5. Wait for the workflow to complete and verify production.
6. Disable the old path only after the new path succeeds.

## Boundaries

ADOB cannot safely automate account ownership proofs, CAPTCHA, payment, legal acceptance, domain registrar access, or first-time privileged installation without an authorized operator.
