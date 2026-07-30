#!/usr/bin/env bash
set -Eeuo pipefail
: "${DEPLOY_DIR:?DEPLOY_DIR is required}"
service="${1:?service is required}"
lines="${2:-200}"
since="${3:-30m}"
[[ "$service" =~ ^[A-Za-z0-9_.-]{1,80}$ ]]
[[ "$lines" == "100" || "$lines" == "200" || "$lines" == "500" ]]
[[ "$since" == "15m" || "$since" == "30m" || "$since" == "2h" || "$since" == "1d" ]]
cd "$DEPLOY_DIR"
mapfile -t allowed < <(docker compose config --services)
printf '%s\n' "${allowed[@]}" | grep -Fxq "$service" || { echo "Service is not in the Compose allow-list" >&2; exit 64; }
redact() { sed -E 's/((token|password|secret|authorization|api[_-]?key)[=:][[:space:]]*)[^[:space:]]+/\1[REDACTED]/Ig'; }
{
  echo '=== compose ps ==='
  docker compose ps
  echo '=== bounded logs ==='
  docker compose logs --no-color --tail "$lines" --since "$since" "$service"
  echo '=== disk ==='
  df -h "$DEPLOY_DIR"
  echo '=== memory ==='
  free -h || true
} 2>&1 | redact
