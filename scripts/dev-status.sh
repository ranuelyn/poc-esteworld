#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS_DIR="$ROOT_DIR/.run/pids"
LOG_DIR="$ROOT_DIR/.run/logs"

print_process() {
  local name="$1"
  local pid_file="$PIDS_DIR/$name.pid"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "[up]   $name (pid: $pid)"
      return
    fi
  fi

  echo "[down] $name"
}

echo "Process status:"
print_process "api"
print_process "worker"
print_process "web"

echo
echo "HTTP checks:"
if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
  echo "[up]   API health"
else
  echo "[down] API health"
fi

if curl -fsS http://localhost:5173 >/dev/null 2>&1; then
  echo "[up]   Web"
else
  echo "[down] Web"
fi

if curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "[up]   Ollama"
else
  echo "[down] Ollama"
fi

echo
echo "Docker services:"
cd "$ROOT_DIR"
docker compose ps

echo
echo "Logs directory: $LOG_DIR"
