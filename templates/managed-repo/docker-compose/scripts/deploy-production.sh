#!/usr/bin/env bash
set -Eeuo pipefail

release_sha="${1:?Usage: deploy-production.sh <git-sha>}"
: "${DEPLOY_DIR:?DEPLOY_DIR is required}"
SOURCE_DIR="${SOURCE_DIR:-${GITHUB_WORKSPACE:-$(pwd)}}"
RETAIN_RELEASES="${ADOB_RETAIN_RELEASES:-5}"

[[ "$release_sha" =~ ^[0-9a-fA-F]{7,64}$ ]] || { echo "Invalid release SHA" >&2; exit 64; }
[[ "$DEPLOY_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "Unsafe DEPLOY_DIR" >&2; exit 64; }
[[ -d "$SOURCE_DIR" ]] || { echo "SOURCE_DIR does not exist" >&2; exit 66; }
command -v rsync >/dev/null
command -v flock >/dev/null
docker compose version >/dev/null

test -f "${DEPLOY_DIR}/.env" || { echo "${DEPLOY_DIR}/.env is required" >&2; exit 78; }
install -d -m 750 "${DEPLOY_DIR}" "${DEPLOY_DIR}/.deploy" "${DEPLOY_DIR}.adob/incoming"
exec 9>"${DEPLOY_DIR}/.deploy/deploy.lock"
flock -w 600 9 || { echo "Timed out waiting for deployment lock" >&2; exit 75; }

incoming="${DEPLOY_DIR}.adob/incoming/${release_sha}"
if [[ "$(realpath -m "$SOURCE_DIR")" != "$(realpath -m "$incoming")" ]]; then
  install -d -m 750 "$incoming"
  rsync -a --delete \
    --exclude '.git/' --exclude '.env' --exclude '.deploy/' --exclude '.adob/' \
    --exclude 'node_modules/' --exclude '__pycache__/' --exclude 'coverage/' \
    "$SOURCE_DIR/" "$incoming/"
fi

rsync -a --delete \
  --exclude '.env' --exclude '.deploy/' --exclude '.adob/' \
  --exclude 'data/' --exclude 'uploads/' --exclude 'storage/' --exclude 'volumes/' --exclude 'backups/' \
  "$incoming/" "$DEPLOY_DIR/"

cd "$DEPLOY_DIR"
docker compose config -q
docker compose build --pull
docker compose up -d --remove-orphans
sleep "${ADOB_HEALTH_SETTLE_SECONDS:-5}"

compose_state="$(docker compose ps --format json || true)"
if grep -Eqi '"State"[[:space:]]*:[[:space:]]*"(exited|dead)"|"Health"[[:space:]]*:[[:space:]]*"unhealthy"' <<<"$compose_state"; then
  docker compose ps >&2
  exit 70
fi

printf '%s\n' "$release_sha" > "${DEPLOY_DIR}/.deploy/current_sha"
printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$release_sha" "${ADOB_MODE:-unknown}" >> "${DEPLOY_DIR}/.deploy/history.log"

test "$RETAIN_RELEASES" -ge 1 2>/dev/null || RETAIN_RELEASES=5
mapfile -t releases < <(find "${DEPLOY_DIR}.adob/incoming" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
for ((i=RETAIN_RELEASES; i<${#releases[@]}; i++)); do rm -rf -- "${releases[i]}"; done

echo "Deployed ${release_sha} to ${DEPLOY_DIR}"
