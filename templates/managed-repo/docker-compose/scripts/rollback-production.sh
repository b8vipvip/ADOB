#!/usr/bin/env bash
set -Eeuo pipefail
: "${DEPLOY_DIR:?DEPLOY_DIR is required}"
confirm="${1:-}"
target="${2:-}"
[[ "$confirm" == "ROLLBACK" ]] || { echo "Literal ROLLBACK confirmation is required" >&2; exit 64; }
current="$(cat "${DEPLOY_DIR}/.deploy/current_sha" 2>/dev/null || true)"
if [[ -z "$target" ]]; then
  target="$(awk '{print $2}' "${DEPLOY_DIR}/.deploy/history.log" 2>/dev/null | tac | awk -v current="$current" '$0 != current && !seen[$0]++ { print; exit }')"
fi
[[ "$target" =~ ^[0-9a-fA-F]{7,64}$ ]] || { echo "No retained rollback SHA is available" >&2; exit 66; }
source_dir="${DEPLOY_DIR}.adob/incoming/${target}"
test -f "${source_dir}/scripts/deploy-production.sh" || { echo "Retained source is missing: ${source_dir}" >&2; exit 66; }
SOURCE_DIR="$source_dir" ADOB_MODE="${ADOB_MODE:-rollback}" bash "${source_dir}/scripts/deploy-production.sh" "$target"
printf '%s rollback-from=%s rollback-to=%s\n' "$(date -u +%FT%TZ)" "$current" "$target" >> "${DEPLOY_DIR}/.deploy/history.log"
