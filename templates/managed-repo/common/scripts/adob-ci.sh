#!/usr/bin/env bash
set -Eeuo pipefail
checks=0

run_npm_script() {
  local name="$1"
  if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['${name}'] ? 0 : 1)"; then
    npm run "$name"
    checks=$((checks + 1))
  fi
}

if [[ -f package.json ]]; then
  if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then npm ci; else npm install; fi
  for script in lint check typecheck test build; do run_npm_script "$script"; done
fi

if [[ -f requirements.txt || -f pyproject.toml ]]; then
  python -m pip install --upgrade pip
  if [[ -f requirements.txt ]]; then python -m pip install -r requirements.txt; else python -m pip install -e .; fi
  if command -v pytest >/dev/null 2>&1 || [[ -d tests ]]; then python -m pytest; checks=$((checks + 1)); fi
fi

if [[ -f go.mod ]]; then go test ./...; checks=$((checks + 1)); fi
if [[ -f Cargo.toml ]]; then cargo test --all; checks=$((checks + 1)); fi
if [[ -f compose.yaml || -f compose.yml || -f docker-compose.yml || -f docker-compose.yaml ]]; then docker compose config -q; checks=$((checks + 1)); fi

if (( checks == 0 )); then
  echo "No supported checks were detected. Edit scripts/adob-ci.sh for this project." >&2
  exit 78
fi
