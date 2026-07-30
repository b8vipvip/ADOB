# Detailed GitHub setup and fast onboarding

**English** | [简体中文](zh-CN/GITHUB_SETUP.md) | [日本語](ja-JP/GITHUB_SETUP.md)

This guide covers the GitHub side of ADOB. Prefer the onboarding wizard for Docker Compose projects; use the manual sections for review, custom runtimes, and troubleshooting.

## 1. Recommended shortest path

```text
Install and authenticate GitHub CLI locally
        ↓
Run setup-managed-repo.sh inside the target repository
        ↓
Review and merge the generated draft pull request
        ↓
Add .adob-project.json to the ADOB server registry
```

The wizard:

- verifies the repository and your write permission;
- creates `adob/onboard-<project-id>`;
- resolves and pins an exact ADOB commit SHA;
- generates CI, deployment, diagnostics, rollback, and status workflows;
- generates Docker Compose adapter scripts;
- configures GitHub Actions variables;
- optionally uploads GHS SSH secrets from files;
- creates `.adob-project.json`;
- optionally commits, pushes, and opens a draft PR.

## 2. Keep the two GitHub credentials separate

### 2.1 ADOB control-service token

The token stored in `/etc/adob-agent/adob.env` is used only to:

- read the sanitized `ops-status` snapshot;
- inspect recent Actions runs;
- dispatch allow-listed deploy, diagnose, and rollback workflows.

Use a fine-grained personal access token with:

| Setting | Recommended value |
|---|---|
| Repository access | Only select repositories |
| Selected repositories | Only repositories managed by this ADOB instance |
| Metadata | Read-only |
| Contents | Read-only |
| Actions | Read and write |
| Expiration | A defined rotation date |

Creation path:

```text
GitHub profile picture
→ Settings
→ Developer settings
→ Personal access tokens
→ Fine-grained tokens
→ Generate new token
```

Organization policy may require approval or impose a maximum lifetime.

### 2.2 Local GitHub CLI authentication

`installer/setup-managed-repo.sh` uses your local `gh` session to configure variables, secrets, branches, and the onboarding PR. It does not copy your local `gh` token into ADOB.

```bash
gh --version
gh auth login
gh auth status
```

## 3. Run the onboarding wizard

Clone and enter the managed project:

```bash
gh repo clone owner/example
cd example
git status
```

The working tree must be clean. Existing generated paths are not overwritten unless `FORCE=true` is explicitly supplied.

Download and inspect the wizard:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/b8vipvip/ADOB/main/installer/setup-managed-repo.sh \
  -o /tmp/setup-managed-repo.sh

less /tmp/setup-managed-repo.sh
bash -n /tmp/setup-managed-repo.sh
```

### 3.1 GHS

Create a dedicated deployment key:

```bash
install -d -m 700 ~/.config/adob/example
ssh-keygen \
  -t ed25519 \
  -C 'github-actions:owner/example' \
  -f ~/.config/adob/example/id_ed25519 \
  -N ''
```

Install the public key on the VPS:

```bash
SSH_PUBLIC_KEY="$(cat ~/.config/adob/example/id_ed25519.pub)" \
DEPLOY_USER=autodevops-deploy \
DEPLOY_DIR=/opt/example \
SSH_HOST=example.com \
SSH_PORT=22 \
sudo -E bash installer/install-ssh-deploy.sh
```

Save the exact `known_hosts` line printed by the installer to a protected file, then run:

```bash
SSH_PRIVATE_KEY_FILE="$HOME/.config/adob/example/id_ed25519" \
SSH_HOST_KEY_FILE="$HOME/.config/adob/example/ssh_host_key" \
bash /tmp/setup-managed-repo.sh
```

### 3.2 VSR

Install the self-hosted Runner first and verify it is `Online / Idle`, then run:

```bash
DEPLOYMENT_MODE=VSR \
RUNNER_LABELS_JSON='["self-hosted","linux","x64","production"]' \
bash /tmp/setup-managed-repo.sh
```

The JSON labels must match the production Runner. Never run untrusted fork workflows on a production VSR Runner.

### 3.3 Non-interactive example

```bash
NON_INTERACTIVE=true \
TARGET_REPO=owner/example \
PROJECT_ID=example \
PROJECT_NAME='Example App' \
PRODUCTION_BRANCH=main \
DEPLOYMENT_MODE=GHS \
DEPLOY_PATH=/opt/example \
VPS_HOST=example.com \
VPS_PORT=22 \
VPS_USER=autodevops-deploy \
PUBLIC_HEALTH_URL=https://example.com/health \
SSH_PRIVATE_KEY_FILE="$HOME/.config/adob/example/id_ed25519" \
SSH_HOST_KEY_FILE="$HOME/.config/adob/example/ssh_host_key" \
COMMIT_AND_PR=true \
bash /tmp/setup-managed-repo.sh
```

## 4. Generated repository files

```text
.github/workflows/ci.yml
.github/workflows/deploy-production.yml
.github/workflows/diagnose-production.yml
.github/workflows/rollback-production.yml
.github/workflows/publish-status.yml
scripts/adob-ci.sh
scripts/deploy-production.sh
scripts/diagnose-production.sh
scripts/rollback-production.sh
scripts/publish-status.sh
.adob-project.json
```

The Docker Compose profile preserves `.env`, `.deploy`, common data/upload/storage/volume/backup directories, serializes deployment with a lock, retains exact release sources, validates Compose state, bounds diagnostics, and requires literal `ROLLBACK` confirmation.

Review the persistence exclusions and application health behavior before merging. Custom runtimes must implement the same four production-script contracts.

## 5. Repository variables

Path:

```text
Repository
→ Settings
→ Secrets and variables
→ Actions
→ Variables
```

### GHS

| Name | Example | Required |
|---|---|---:|
| `ADOB_MODE` | `GHS` | Yes |
| `ADOB_PROJECT_ID` | `example` | Yes |
| `ADOB_PROJECT_NAME` | `Example App` | Recommended |
| `VPS_HOST` | `example.com` | Yes |
| `VPS_PORT` | `22` | Yes |
| `VPS_USER` | `autodevops-deploy` | Yes |
| `DEPLOY_PATH` | `/opt/example` | Yes |
| `PUBLIC_HEALTH_URL` | `https://example.com/health` | Optional |

### VSR

| Name | Example | Required |
|---|---|---:|
| `ADOB_MODE` | `VSR` | Yes |
| `ADOB_PROJECT_ID` | `example` | Yes |
| `ADOB_PROJECT_NAME` | `Example App` | Recommended |
| `ADOB_RUNNER_LABELS_JSON` | `["self-hosted","linux","x64","production"]` | Yes |
| `DEPLOY_PATH` | `/opt/example` | Yes |
| `PUBLIC_HEALTH_URL` | `https://example.com/health` | Optional |

Variables are not masked. Store only non-sensitive configuration in them.

```bash
gh variable list --repo owner/example
gh variable set DEPLOY_PATH --repo owner/example --body /opt/example
```

## 6. Repository secrets

Path:

```text
Repository
→ Settings
→ Secrets and variables
→ Actions
→ Secrets
```

GHS requires:

| Name | Value |
|---|---|
| `SSH_PRIVATE_KEY` | Complete dedicated deployment private key |
| `SSH_HOST_KEY` | Exact single-line `known_hosts` entry for the VPS |

```bash
gh secret set SSH_PRIVATE_KEY --repo owner/example < ~/.config/adob/example/id_ed25519
gh secret set SSH_HOST_KEY --repo owner/example < ~/.config/adob/example/ssh_host_key
gh secret list --repo owner/example
```

GitHub does not expose the original secret value after upload. Rotate a secret by overwriting the same name.

## 7. Actions settings

Path:

```text
Repository
→ Settings
→ Actions
→ General
```

The repository must allow GitHub-authored actions and reusable workflows from `b8vipvip/ADOB`. For a restrictive allow-list, include patterns equivalent to:

```text
actions/*
github/*
b8vipvip/ADOB/.github/workflows/*@*
```

Keep the default workflow token permission restricted when possible:

```text
Read repository contents and packages permissions
```

Status workflows explicitly request:

```yaml
permissions:
  contents: write
```

If an organization policy prevents that elevation, status publication will fail with `403` until an administrator permits repository-content writes for the workflow.

ADOB does not require the option that lets Actions create or approve pull requests; the local `gh` session creates the onboarding PR.

## 8. Protect the production branch

Create a ruleset or branch-protection rule for `main` or the configured production branch. Recommended requirements:

- merge through pull requests;
- one or more approvals for team repositories;
- required `CI / test` check;
- resolved review conversations;
- no force pushes;
- no deletion;
- optional prevention of administrator bypass.

Run CI successfully once before selecting its check as required. Do not apply a PR-review rule to `ops-status`; it is a machine-maintained status branch. Exclude it from broad rulesets or provide an appropriate Actions bypass.

## 9. Workflow roles

- `ci.yml`: runs project checks for pull requests and production-branch pushes.
- `deploy-production.yml`: only supports `workflow_dispatch`; ADOB triggers this exact file.
- `diagnose-production.yml`: accepts only a Compose service name and bounded line/time choices.
- `rollback-production.yml`: requires literal `ROLLBACK` and an optional retained SHA.
- `publish-status.yml`: creates or updates the isolated `ops-status` branch and writes only sanitized status files.

Reusable GHS workflows are pinned to a complete ADOB commit SHA by the wizard.

## 10. Register the project with ADOB

The wizard creates `.adob-project.json`. Add that object to the `AUTODEVOPS_PROJECTS_JSON` array in `/etc/adob-agent/adob.env`, keep the entire environment value as valid one-line JSON, then restart:

```bash
sudo editor /etc/adob-agent/adob.env
sudo docker compose -f /opt/adob-agent/compose.yaml up -d --build
curl http://127.0.0.1:8787/health
```

## 11. First validation order

1. Merge the onboarding PR.
2. Confirm `CI` succeeds.
3. GHS: confirm both SSH secrets exist.
4. VSR: confirm the Runner is `Online / Idle`.
5. Create the production `.env` in `DEPLOY_PATH`.
6. Manually run `Publish production status`.
7. Inspect `ops-status/status/status.json` for secrets or user data.
8. Register the project in ADOB.
9. Ask the Agent to list projects and read status.
10. Attempt deployment only after the read-only checks succeed.

## 12. Troubleshooting

### `Resource not accessible by integration`

Check workflow `contents: write`, organization token policy, and rules affecting `ops-status`.

### Workflow not found

Confirm the workflow filename in the registry, that it is merged into the production branch, that it contains `workflow_dispatch`, and that the ADOB token has Actions access.

### `Bad credentials` or `403`

Check token expiry, selected repository access, Contents read permission, Actions read/write permission, and organization approval status.

### `Host key verification failed`

Do not disable checking. Replace `SSH_HOST_KEY` with the exact host-key line obtained through an authorized VPS administration session.

### `Permission denied (publickey)`

Verify that the private key matches the installed public key, `VPS_USER` is correct, and `authorized_keys` permissions are valid.

### Missing `.env`

Create the production `.env` directly inside `DEPLOY_PATH`. ADOB intentionally does not upload it from GitHub.

### Required check remains pending

Select the check name produced by a successful run, such as `CI / test`, and avoid duplicate job names across workflows.

## 13. Security checklist

- [ ] Fine-grained ADOB token is limited to selected repositories.
- [ ] Token has an expiration and rotation owner.
- [ ] GHS uses a dedicated deployment key.
- [ ] Private key exists only in Actions Secrets.
- [ ] VPS host identity is pinned.
- [ ] Production `.env` never enters GitHub.
- [ ] Production branch requires PR and CI.
- [ ] `ops-status` contains no secrets, cookies, user records, or raw unrestricted logs.
- [ ] Reusable workflows are pinned to full SHAs.
- [ ] Database-migration effects are reviewed before rollback.

## 14. Remove onboarding

Delete variables and secrets, remove or disable the workflows, and remove the project from the ADOB server registry. Do not leave an unused long-lived deployment key behind.

```bash
gh variable delete ADOB_MODE --repo owner/example
gh variable delete ADOB_PROJECT_ID --repo owner/example
gh variable delete DEPLOY_PATH --repo owner/example
gh secret delete SSH_PRIVATE_KEY --repo owner/example
gh secret delete SSH_HOST_KEY --repo owner/example
```
