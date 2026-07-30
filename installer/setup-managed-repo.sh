#!/usr/bin/env bash
set -Eeuo pipefail

ADOB_REPOSITORY="${ADOB_REPOSITORY:-b8vipvip/ADOB}"
ADOB_REF="${ADOB_REF:-main}"
TARGET_REPO="${TARGET_REPO:-}"
DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-}"
PROJECT_ID="${PROJECT_ID:-}"
PROJECT_NAME="${PROJECT_NAME:-}"
PRODUCTION_BRANCH="${PRODUCTION_BRANCH:-}"
PROJECT_PROFILE="${PROJECT_PROFILE:-docker-compose}"
DEPLOY_PATH="${DEPLOY_PATH:-}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-}"
VPS_HOST="${VPS_HOST:-}"
VPS_PORT="${VPS_PORT:-22}"
VPS_USER="${VPS_USER:-autodevops-deploy}"
RUNNER_LABELS_JSON="${RUNNER_LABELS_JSON:-[\"self-hosted\",\"linux\",\"x64\",\"production\"]}"
SSH_PRIVATE_KEY_FILE="${SSH_PRIVATE_KEY_FILE:-}"
SSH_HOST_KEY_FILE="${SSH_HOST_KEY_FILE:-}"
ONBOARD_BRANCH="${ONBOARD_BRANCH:-}"
COMMIT_AND_PR="${COMMIT_AND_PR:-ask}"
FORCE="${FORCE:-false}"
NON_INTERACTIVE="${NON_INTERACTIVE:-false}"
TEMPLATE_BASE_URL="${TEMPLATE_BASE_URL:-}"

log() { printf '[ADOB] %s\n' "$*"; }
warn() { printf '[ADOB] WARNING: %s\n' "$*" >&2; }
fail() { printf '[ADOB] ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"; }

prompt() {
  local variable="$1" label="$2" default_value="${3:-}" value
  value="${!variable:-}"
  if [[ -n "$value" ]]; then return; fi
  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    [[ -n "$default_value" ]] || fail "$variable is required in non-interactive mode"
    printf -v "$variable" '%s' "$default_value"
    return
  fi
  if [[ -n "$default_value" ]]; then
    read -r -p "$label [$default_value]: " value
    value="${value:-$default_value}"
  else
    read -r -p "$label: " value
  fi
  [[ -n "$value" ]] || fail "$label cannot be empty"
  printf -v "$variable" '%s' "$value"
}

confirm() {
  local label="$1" default_value="${2:-yes}" answer
  if [[ "$NON_INTERACTIVE" == "true" ]]; then [[ "$default_value" == "yes" ]]; return; fi
  if [[ "$default_value" == "yes" ]]; then
    read -r -p "$label [Y/n]: " answer
    [[ -z "$answer" || "$answer" =~ ^[Yy]$ ]]
  else
    read -r -p "$label [y/N]: " answer
    [[ "$answer" =~ ^[Yy]$ ]]
  fi
}

safe_repo_id() {
  printf '%s' "$1" | tr '[:upper:]_' '[:lower:]-' | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
}

prepare_path() {
  local path="$1"
  if [[ -e "$path" && "$FORCE" != "true" ]]; then
    fail "$path already exists. Review it or rerun with FORCE=true."
  fi
  mkdir -p "$(dirname "$path")"
}

fetch_template() {
  local source="$1" target="$2"
  prepare_path "$target"
  curl --fail --silent --show-error --location "${TEMPLATE_BASE_URL}/${source}" -o "$target"
}

replace_placeholders() {
  local file="$1" escaped_sha escaped_branch
  escaped_sha="$(printf '%s' "$ADOB_SHA" | sed 's/[&|]/\\&/g')"
  escaped_branch="$(printf '%s' "$PRODUCTION_BRANCH" | sed 's/[&|]/\\&/g')"
  sed -i "s|__ADOB_SHA__|${escaped_sha}|g; s|__PRODUCTION_BRANCH__|${escaped_branch}|g" "$file"
}

for command in gh git jq sed curl; do need "$command"; done
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated. Run: gh auth login"
git rev-parse --show-toplevel >/dev/null 2>&1 || fail "Run this inside the target project's local Git repository."
cd "$(git rev-parse --show-toplevel)"
[[ -z "$(git status --porcelain)" ]] || fail "Commit or stash existing changes before onboarding."

if [[ -z "$TARGET_REPO" ]]; then TARGET_REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"; fi
[[ "$TARGET_REPO" =~ ^[^/[:space:]]+/[^/[:space:]]+$ ]] || fail "TARGET_REPO must be owner/repository"
VIEWER_PERMISSION="$(gh repo view "$TARGET_REPO" --json viewerPermission --jq .viewerPermission)"
case "$VIEWER_PERMISSION" in ADMIN|MAINTAIN|WRITE) ;; *) fail "GitHub permission $VIEWER_PERMISSION cannot configure $TARGET_REPO" ;; esac

DEFAULT_BRANCH="$(gh repo view "$TARGET_REPO" --json defaultBranchRef --jq .defaultBranchRef.name)"
prompt PRODUCTION_BRANCH "Production branch" "$DEFAULT_BRANCH"
REPO_NAME="${TARGET_REPO##*/}"
prompt PROJECT_ID "Stable lowercase project ID" "$(safe_repo_id "$REPO_NAME")"
prompt PROJECT_NAME "Display name" "$REPO_NAME"
prompt DEPLOYMENT_MODE "Deployment mode (GHS or VSR)" "GHS"
DEPLOYMENT_MODE="${DEPLOYMENT_MODE^^}"
[[ "$DEPLOYMENT_MODE" == "GHS" || "$DEPLOYMENT_MODE" == "VSR" ]] || fail "DEPLOYMENT_MODE must be GHS or VSR"
[[ "$PROJECT_ID" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || fail "Invalid PROJECT_ID"
[[ "$PROJECT_PROFILE" == "docker-compose" ]] || fail "The current wizard supports PROJECT_PROFILE=docker-compose; use the manual guide for custom runtimes."
prompt DEPLOY_PATH "Absolute production directory on the VPS" "/opt/${PROJECT_ID}"
[[ "$DEPLOY_PATH" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "Unsafe DEPLOY_PATH"

if [[ "$DEPLOYMENT_MODE" == "GHS" ]]; then
  prompt VPS_HOST "VPS SSH hostname or public IP"
  prompt VPS_PORT "VPS SSH port" "22"
  prompt VPS_USER "Dedicated VPS deployment user" "autodevops-deploy"
  [[ "$VPS_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || fail "Invalid VPS_HOST"
  [[ "$VPS_PORT" =~ ^[0-9]{1,5}$ ]] && (( VPS_PORT >= 1 && VPS_PORT <= 65535 )) || fail "Invalid VPS_PORT"
  [[ "$VPS_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "Invalid VPS_USER"
else
  jq -e 'type == "array" and length > 0 and all(.[]; type == "string")' <<<"$RUNNER_LABELS_JSON" >/dev/null || fail "Invalid RUNNER_LABELS_JSON"
fi

if [[ -z "$PUBLIC_HEALTH_URL" && "$NON_INTERACTIVE" != "true" ]]; then
  read -r -p "Optional public health URL (leave blank to skip): " PUBLIC_HEALTH_URL
fi

log "Resolving exact ADOB revision ${ADOB_REPOSITORY}@${ADOB_REF}"
ADOB_SHA="$(gh api "repos/${ADOB_REPOSITORY}/commits/${ADOB_REF}" --jq .sha)"
[[ "$ADOB_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "Unable to resolve ADOB commit SHA"
TEMPLATE_BASE_URL="${TEMPLATE_BASE_URL:-https://raw.githubusercontent.com/${ADOB_REPOSITORY}/${ADOB_SHA}/templates/managed-repo}"

ONBOARD_BRANCH="${ONBOARD_BRANCH:-adob/onboard-${PROJECT_ID}}"
if git show-ref --verify --quiet "refs/heads/${ONBOARD_BRANCH}" || git ls-remote --exit-code --heads origin "$ONBOARD_BRANCH" >/dev/null 2>&1; then
  fail "Branch already exists: ${ONBOARD_BRANCH}"
fi
git fetch origin "$PRODUCTION_BRANCH"
git switch --create "$ONBOARD_BRANCH" "origin/$PRODUCTION_BRANCH"

log "Downloading reviewed starter templates"
fetch_template common/.github/workflows/ci.yml .github/workflows/ci.yml
fetch_template common/scripts/adob-ci.sh scripts/adob-ci.sh
for name in deploy-production diagnose-production rollback-production publish-status; do
  fetch_template "${DEPLOYMENT_MODE,,}/.github/workflows/${name}.yml" ".github/workflows/${name}.yml"
  fetch_template "docker-compose/scripts/${name}.sh" "scripts/${name}.sh"
done
chmod +x scripts/*.sh
for file in .github/workflows/*.yml; do replace_placeholders "$file"; done

log "Setting GitHub Actions variables"
gh variable set ADOB_MODE --repo "$TARGET_REPO" --body "$DEPLOYMENT_MODE"
gh variable set ADOB_PROJECT_ID --repo "$TARGET_REPO" --body "$PROJECT_ID"
gh variable set ADOB_PROJECT_NAME --repo "$TARGET_REPO" --body "$PROJECT_NAME"
gh variable set DEPLOY_PATH --repo "$TARGET_REPO" --body "$DEPLOY_PATH"
if [[ -n "$PUBLIC_HEALTH_URL" ]]; then gh variable set PUBLIC_HEALTH_URL --repo "$TARGET_REPO" --body "$PUBLIC_HEALTH_URL"; fi

if [[ "$DEPLOYMENT_MODE" == "GHS" ]]; then
  gh variable set VPS_HOST --repo "$TARGET_REPO" --body "$VPS_HOST"
  gh variable set VPS_PORT --repo "$TARGET_REPO" --body "$VPS_PORT"
  gh variable set VPS_USER --repo "$TARGET_REPO" --body "$VPS_USER"
  if [[ -n "$SSH_PRIVATE_KEY_FILE" ]]; then
    [[ -f "$SSH_PRIVATE_KEY_FILE" ]] || fail "SSH_PRIVATE_KEY_FILE does not exist"
    gh secret set SSH_PRIVATE_KEY --repo "$TARGET_REPO" < "$SSH_PRIVATE_KEY_FILE"
  else
    warn "Set later: gh secret set SSH_PRIVATE_KEY --repo ${TARGET_REPO} < /secure/private-key"
  fi
  if [[ -n "$SSH_HOST_KEY_FILE" ]]; then
    [[ -f "$SSH_HOST_KEY_FILE" ]] || fail "SSH_HOST_KEY_FILE does not exist"
    gh secret set SSH_HOST_KEY --repo "$TARGET_REPO" < "$SSH_HOST_KEY_FILE"
  else
    warn "Set later: gh secret set SSH_HOST_KEY --repo ${TARGET_REPO} < /secure/known-host-line"
  fi
else
  gh variable set ADOB_RUNNER_LABELS_JSON --repo "$TARGET_REPO" --body "$RUNNER_LABELS_JSON"
fi

PROJECT_JSON="$(jq -n --arg id "$PROJECT_ID" --arg name "$PROJECT_NAME" --arg repo "$TARGET_REPO" --arg branch "$PRODUCTION_BRANCH" --arg mode "$DEPLOYMENT_MODE" '{id:$id,name:$name,repo:$repo,productionBranch:$branch,statusBranch:"ops-status",statusPath:"status/status.json",deploymentMode:$mode,workflows:{deploy:"deploy-production.yml",diagnose:"diagnose-production.yml",rollback:"rollback-production.yml"}}')"
printf '%s\n' "$PROJECT_JSON" > .adob-project.json

git add .github/workflows scripts .adob-project.json
log "Generated files:"
git diff --cached --stat

case "$COMMIT_AND_PR" in
  true) CREATE_PR=true ;;
  false) CREATE_PR=false ;;
  ask) if confirm "Commit, push, and open a draft onboarding PR?" yes; then CREATE_PR=true; else CREATE_PR=false; fi ;;
  *) fail "COMMIT_AND_PR must be true, false, or ask" ;;
esac

if [[ "$CREATE_PR" == "true" ]]; then
  git commit -m "chore: onboard ${PROJECT_ID} to ADOB"
  git push --set-upstream origin "$ONBOARD_BRANCH"
  PR_URL="$(gh pr create --repo "$TARGET_REPO" --draft --base "$PRODUCTION_BRANCH" --head "$ONBOARD_BRANCH" --title "chore: onboard ${PROJECT_ID} to ADOB" --body "Adds ADOB CI, deployment, diagnostics, rollback, and sanitized status workflows. Review persistence exclusions and health checks before merging.")"
  log "Draft PR: ${PR_URL}"
else
  warn "Files are staged but not committed. Review with: git diff --cached"
fi

cat <<EOF

ADOB GitHub onboarding generated successfully.
Repository:        ${TARGET_REPO}
Project ID:        ${PROJECT_ID}
Mode:              ${DEPLOYMENT_MODE}
Pinned ADOB SHA:   ${ADOB_SHA}
Onboarding branch: ${ONBOARD_BRANCH}

Project registry entry:
${PROJECT_JSON}

Final checks:
1. Review deployment persistence exclusions and health checks.
2. In Settings > Actions > General, allow the generated workflows.
3. Protect ${PRODUCTION_BRANCH} and require the CI job before merge.
4. For GHS, set SSH_PRIVATE_KEY and SSH_HOST_KEY; for VSR, verify the Runner is Online.
5. Run CI, then run Publish production status manually.
6. Verify ops-status/status/status.json contains no secrets.
7. Add the JSON entry to AUTODEVOPS_PROJECTS_JSON and restart ADOB.
EOF
