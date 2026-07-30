#!/usr/bin/env bash
set -Eeuo pipefail
: "${DEPLOY_DIR:?DEPLOY_DIR is required}"
command -v jq >/dev/null
cd "$DEPLOY_DIR"
release_sha="$(cat .deploy/current_sha 2>/dev/null || printf unknown)"
services="$(docker compose ps --format json 2>/dev/null | jq -s 'if length == 1 and (.[0] | type) == "array" then .[0] else . end | map({name: .Name, service: .Service, state: .State, health: (.Health // ""), status: .Status})')"
disk_percent="$(df -P "$DEPLOY_DIR" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
load_average="$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null || printf unknown)"
jq -n \
  --arg project "${ADOB_PROJECT_ID:-unknown}" \
  --arg mode "${ADOB_MODE:-unknown}" \
  --arg release_sha "$release_sha" \
  --arg updated_at "$(date -u +%FT%TZ)" \
  --arg load_average "$load_average" \
  --argjson disk_percent "${disk_percent:-0}" \
  --argjson services "$services" \
  '{project:$project,deploymentMode:$mode,releaseSha:$release_sha,updatedAt:$updated_at,health:{diskPercent:$disk_percent,loadAverage:$load_average,services:$services}}'
