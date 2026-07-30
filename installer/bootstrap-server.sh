#!/usr/bin/env bash
set -Eeuo pipefail

# ADOB — GPT–GitHub–VPS Automated Development Agent
# Installs the ADOB MCP controller with Docker Compose on Debian/Ubuntu.

if (( EUID != 0 )); then
  echo "Run this installer as root: sudo bash $0" >&2
  exit 77
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Unsupported system: /etc/os-release is missing." >&2
  exit 69
fi

# shellcheck disable=SC1091
source /etc/os-release
case "${ID:-}:${ID_LIKE:-}" in
  ubuntu:*|debian:*|*:debian*) ;;
  *)
    echo "This installer currently supports Debian and Ubuntu." >&2
    exit 69
    ;;
esac

ADOB_REPOSITORY_URL="${ADOB_REPOSITORY_URL:-https://github.com/b8vipvip/ADOB.git}"
ADOB_REF="${ADOB_REF:-main}"
ADOB_SOURCE_DIR="${ADOB_SOURCE_DIR:-/opt/adob-agent}"
ADOB_CONFIG_DIR="${ADOB_CONFIG_DIR:-/etc/adob-agent}"
ADOB_BIND_ADDRESS="${ADOB_BIND_ADDRESS:-127.0.0.1}"
ADOB_PORT="${ADOB_PORT:-8787}"
AUTODEVOPS_ALLOWED_HOSTS="${AUTODEVOPS_ALLOWED_HOSTS:-127.0.0.1,localhost}"
CONFIGURE_GHS_TARGET="${CONFIGURE_GHS_TARGET:-ask}"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

prompt_default() {
  local variable_name="$1"
  local prompt="$2"
  local default_value="$3"
  local current_value="${!variable_name:-}"
  if [[ -z "${current_value}" ]]; then
    read -r -p "${prompt} [${default_value}]: " current_value
    current_value="${current_value:-${default_value}}"
    printf -v "${variable_name}" '%s' "${current_value}"
  fi
}

prompt_required() {
  local variable_name="$1"
  local prompt="$2"
  local current_value="${!variable_name:-}"
  while [[ -z "${current_value}" ]]; do
    read -r -p "${prompt}: " current_value
  done
  printf -v "${variable_name}" '%s' "${current_value}"
}

read_secret() {
  local variable_name="$1"
  local file_variable_name="$2"
  local prompt="$3"
  local current_value="${!variable_name:-}"
  local secret_file="${!file_variable_name:-}"

  if [[ -z "${current_value}" && -n "${secret_file}" ]]; then
    [[ -r "${secret_file}" ]] || fail "Cannot read ${file_variable_name}: ${secret_file}"
    current_value="$(tr -d '\r\n' < "${secret_file}")"
  fi
  if [[ -z "${current_value}" ]]; then
    read -r -s -p "${prompt}: " current_value
    echo
  fi
  [[ -n "${current_value}" ]] || fail "${variable_name} cannot be empty"
  printf -v "${variable_name}" '%s' "${current_value}"
}

validate_safe_path() {
  [[ "$1" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "Unsafe absolute path: $1"
}

[[ "${ADOB_PORT}" =~ ^[0-9]{1,5}$ ]] && (( ADOB_PORT >= 1 && ADOB_PORT <= 65535 )) \
  || fail "ADOB_PORT must be between 1 and 65535"
validate_safe_path "${ADOB_SOURCE_DIR}"
validate_safe_path "${ADOB_CONFIG_DIR}"

export DEBIAN_FRONTEND=noninteractive
log "Installing operating-system dependencies"
apt-get update
apt-get install -y ca-certificates curl git jq openssl docker.io
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-v2 2>/dev/null \
    || apt-get install -y docker-compose-plugin 2>/dev/null \
    || fail "Docker Compose v2 is unavailable. Install it and rerun this script."
fi
systemctl enable --now docker

log "Collecting ADOB project configuration"
read_secret GITHUB_TOKEN GITHUB_TOKEN_FILE "Paste a fine-grained GitHub token"

if [[ -z "${AUTODEVOPS_PROJECTS_JSON:-}" ]]; then
  prompt_required PROJECT_REPO "Managed GitHub repository (owner/repo)"
  [[ "${PROJECT_REPO}" =~ ^[^/[:space:]]+/[^/[:space:]]+$ ]] \
    || fail "PROJECT_REPO must use owner/repo format"

  default_id="${PROJECT_REPO##*/}"
  default_id="$(printf '%s' "${default_id}" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9_.-' '-')"
  default_id="${default_id#-}"
  default_id="${default_id%-}"
  prompt_default PROJECT_ID "Project ID" "${default_id:-project}"
  [[ "${PROJECT_ID}" =~ ^[a-zA-Z0-9_.-]+$ ]] || fail "PROJECT_ID contains unsupported characters"
  prompt_default PROJECT_NAME "Project display name" "${PROJECT_REPO##*/}"
  prompt_default PRODUCTION_BRANCH "Production branch" "main"
  prompt_default DEPLOYMENT_MODE "Deployment mode (VSR or GHS)" "GHS"
  DEPLOYMENT_MODE="${DEPLOYMENT_MODE^^}"
  [[ "${DEPLOYMENT_MODE}" == "VSR" || "${DEPLOYMENT_MODE}" == "GHS" ]] \
    || fail "DEPLOYMENT_MODE must be VSR or GHS"

  AUTODEVOPS_PROJECTS_JSON="$(jq -cn \
    --arg id "${PROJECT_ID}" \
    --arg name "${PROJECT_NAME}" \
    --arg repo "${PROJECT_REPO}" \
    --arg productionBranch "${PRODUCTION_BRANCH}" \
    --arg mode "${DEPLOYMENT_MODE}" \
    '[{
      id: $id,
      name: $name,
      repo: $repo,
      productionBranch: $productionBranch,
      statusBranch: "ops-status",
      statusPath: "status/status.json",
      deploymentMode: $mode,
      workflows: {
        deploy: "deploy-production.yml",
        diagnose: "diagnose-production.yml",
        rollback: "rollback-production.yml"
      }
    }]')"
else
  printf '%s' "${AUTODEVOPS_PROJECTS_JSON}" | jq -e 'type == "array"' >/dev/null \
    || fail "AUTODEVOPS_PROJECTS_JSON must be a valid JSON array"
  AUTODEVOPS_PROJECTS_JSON="$(printf '%s' "${AUTODEVOPS_PROJECTS_JSON}" | jq -c .)"
  DEPLOYMENT_MODE="$(printf '%s' "${AUTODEVOPS_PROJECTS_JSON}" | jq -r '.[0].deploymentMode // "VSR"')"
  PROJECT_ID="$(printf '%s' "${AUTODEVOPS_PROJECTS_JSON}" | jq -r '.[0].id // "project"')"
fi

if [[ -z "${MCP_SHARED_SECRET:-}" ]]; then
  MCP_SHARED_SECRET="$(openssl rand -hex 32)"
fi

log "Downloading ADOB ${ADOB_REF}"
install -d -m 755 "${ADOB_SOURCE_DIR}"
if [[ ! -d "${ADOB_SOURCE_DIR}/.git" ]]; then
  rm -rf "${ADOB_SOURCE_DIR}"
  git clone --filter=blob:none "${ADOB_REPOSITORY_URL}" "${ADOB_SOURCE_DIR}"
fi
git -C "${ADOB_SOURCE_DIR}" fetch --depth 1 origin "${ADOB_REF}"
git -C "${ADOB_SOURCE_DIR}" checkout --detach --force FETCH_HEAD

log "Writing protected runtime configuration"
umask 077
install -d -m 700 "${ADOB_CONFIG_DIR}"
cat >"${ADOB_CONFIG_DIR}/adob.env" <<EOF_ENV
AUTODEVOPS_TRANSPORT=http
AUTODEVOPS_HOST=0.0.0.0
AUTODEVOPS_PORT=8787
AUTODEVOPS_ALLOWED_HOSTS=${AUTODEVOPS_ALLOWED_HOSTS}
GITHUB_TOKEN=${GITHUB_TOKEN}
MCP_SHARED_SECRET=${MCP_SHARED_SECRET}
AUTODEVOPS_PROJECTS_JSON=${AUTODEVOPS_PROJECTS_JSON}
EOF_ENV
chmod 600 "${ADOB_CONFIG_DIR}/adob.env"

cat >"${ADOB_SOURCE_DIR}/compose.yaml" <<EOF_COMPOSE
services:
  adob-agent:
    build:
      context: ./mcp-server
    container_name: adob-agent
    env_file:
      - ${ADOB_CONFIG_DIR}/adob.env
    ports:
      - "${ADOB_BIND_ADDRESS}:${ADOB_PORT}:8787"
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
EOF_COMPOSE

log "Building and starting the GPT–GitHub–VPS Agent"
docker compose -f "${ADOB_SOURCE_DIR}/compose.yaml" up -d --build

HEALTH_HOST="${ADOB_BIND_ADDRESS}"
if [[ "${HEALTH_HOST}" == "0.0.0.0" ]]; then
  HEALTH_HOST="127.0.0.1"
fi
for _ in $(seq 1 30); do
  if curl --fail --silent "http://${HEALTH_HOST}:${ADOB_PORT}/health" >/dev/null; then
    break
  fi
  sleep 2
done
curl --fail --silent "http://${HEALTH_HOST}:${ADOB_PORT}/health" | jq . \
  || fail "ADOB did not become healthy. Run: docker compose -f ${ADOB_SOURCE_DIR}/compose.yaml logs"

if [[ "${DEPLOYMENT_MODE}" == "GHS" ]]; then
  if [[ "${CONFIGURE_GHS_TARGET}" == "ask" ]]; then
    read -r -p "Configure this server as the GHS deployment target too? [y/N]: " answer
    case "${answer,,}" in
      y|yes) CONFIGURE_GHS_TARGET=true ;;
      *) CONFIGURE_GHS_TARGET=false ;;
    esac
  fi

  if [[ "${CONFIGURE_GHS_TARGET}" == "true" ]]; then
    prompt_required SSH_PUBLIC_KEY "GitHub Actions deployment public key"
    prompt_default DEPLOY_USER "GHS deployment user" "autodevops-deploy"
    prompt_default DEPLOY_DIR "Application deployment directory" "/opt/${PROJECT_ID:-project}"
    SSH_PUBLIC_KEY="${SSH_PUBLIC_KEY}" \
    DEPLOY_USER="${DEPLOY_USER}" \
    DEPLOY_DIR="${DEPLOY_DIR}" \
    SSH_HOST="${SSH_HOST:-}" \
    SSH_PORT="${SSH_PORT:-22}" \
      bash "${ADOB_SOURCE_DIR}/installer/install-ssh-deploy.sh"
  fi
fi

cat <<EOF_DONE

ADOB GPT–GitHub–VPS Agent is running.

MCP URL:        http://${ADOB_BIND_ADDRESS}:${ADOB_PORT}/mcp
Health URL:     http://${ADOB_BIND_ADDRESS}:${ADOB_PORT}/health
Source:         ${ADOB_SOURCE_DIR}
Configuration:  ${ADOB_CONFIG_DIR}/adob.env
Compose file:   ${ADOB_SOURCE_DIR}/compose.yaml

The bearer secret is stored in ${ADOB_CONFIG_DIR}/adob.env.
Read it with:
  sudo sed -n 's/^MCP_SHARED_SECRET=//p' ${ADOB_CONFIG_DIR}/adob.env

Useful commands:
  docker compose -f ${ADOB_SOURCE_DIR}/compose.yaml ps
  docker compose -f ${ADOB_SOURCE_DIR}/compose.yaml logs -f
  docker compose -f ${ADOB_SOURCE_DIR}/compose.yaml up -d --build

Security notes:
- The default bind address is 127.0.0.1. Keep it private or place it behind HTTPS.
- Never paste the GitHub token or SSH private key into GPT conversations.
- Remote/public ChatGPT use requires a verified HTTPS endpoint and the authentication model described in the documentation.
EOF_DONE
