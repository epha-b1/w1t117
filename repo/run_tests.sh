#!/usr/bin/env bash
#
# Docker-only test runner. Fails fast if Docker or Docker Compose v2 is not
# available. Tests execute exclusively inside the `test` compose target — no
# host npm fallback, no host-side dependency resolution.
#
set -eu

# Resolve script directory, POSIX-safe (works in Git Bash too).
SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "[run_tests] ERROR: 'docker' is not installed or not on PATH." >&2
  echo "[run_tests] This project is Docker-only. Install Docker and retry." >&2
  exit 2
fi

if ! docker info >/dev/null 2>&1; then
  echo "[run_tests] ERROR: Docker daemon is not reachable." >&2
  echo "[run_tests] Start the Docker daemon and retry." >&2
  exit 2
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[run_tests] ERROR: Docker Compose v2 plugin ('docker compose') is not installed." >&2
  echo "[run_tests] This project is Docker-only and requires the v2 plugin." >&2
  echo "[run_tests] See https://docs.docker.com/compose/install/ to install." >&2
  exit 2
fi

echo "[run_tests] Running tests inside Docker Compose 'test' target."
exec docker compose run --rm --build test
