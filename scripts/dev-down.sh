#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS_DIR="$ROOT_DIR/.run/pids"

stop_process() {
  local name="$1"
  local pid_file="$PIDS_DIR/$name.pid"

  if [[ ! -f "$pid_file" ]]; then
    echo "[skip] $name not tracked"
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "${pid:-}" ]]; then
    rm -f "$pid_file"
    echo "[skip] $name pid file was empty"
    return
  fi

  if kill -0 "$pid" 2>/dev/null; then
    echo "[stop] $name (pid: $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  else
    echo "[skip] $name pid $pid already stopped"
  fi

  rm -f "$pid_file"
}

stop_process "web"
stop_process "worker"
stop_process "api"

echo "[step] Stopping Docker services"
cd "$ROOT_DIR"
docker compose stop

echo "All services stopped."
