#!/usr/bin/env bash
#
# Cross-platform test runner.
# - If Docker daemon is reachable, runs tests inside a Node container (works on
#   any host regardless of local Node / npm state).
# - Otherwise falls back to running locally with npm.
# Works on Linux, macOS, WSL, and Git Bash on Windows.
#
set -eu

# Resolve script directory, POSIX-safe (works in Git Bash too).
SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

docker_ready() {
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1 || return 1
  # Prefer `docker compose` (v2); fall back to docker-compose binary.
  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    return 1
  fi
  return 0
}

run_in_docker() {
  echo "[run_tests] Docker daemon detected — running tests inside container."
  $COMPOSE run --rm --build test
}

run_locally() {
  echo "[run_tests] Docker unavailable — running tests locally."
  if ! command -v npm >/dev/null 2>&1; then
    echo "[run_tests] ERROR: neither Docker nor npm is available on this machine." >&2
    exit 1
  fi
  if [ ! -d node_modules ]; then
    npm install --no-audit --no-fund
  fi
  npm test
}

if docker_ready; then
  run_in_docker
else
  run_locally
fi
