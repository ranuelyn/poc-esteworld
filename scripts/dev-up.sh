#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
PIDS_DIR="$RUN_DIR/pids"

mkdir -p "$LOG_DIR" "$PIDS_DIR"

start_process() {
  local name="$1"
  local command="$2"
  local pid_file="$PIDS_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if [[ -f "$pid_file" ]]; then
    local existing_pid
    existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "${existing_pid:-}" ]] && kill -0 "$existing_pid" 2>/dev/null; then
      echo "[skip] $name already running (pid: $existing_pid)"
      return
    fi
  fi

  echo "[start] $name"
  nohup zsh -lc "cd \"$ROOT_DIR\" && $command" >"$log_file" 2>&1 &
  local new_pid=$!
  echo "$new_pid" >"$pid_file"
  echo "[ok] $name started (pid: $new_pid)"
}

wait_http() {
  local name="$1"
  local url="$2"
  local timeout_seconds="${3:-60}"
  local elapsed=0

  echo "[wait] $name -> $url"
  until curl -fsS "$url" >/dev/null 2>&1; do
    sleep 2
    elapsed=$((elapsed + 2))
    if (( elapsed >= timeout_seconds )); then
      echo "[error] $name did not become ready in ${timeout_seconds}s" >&2
      exit 1
    fi
  done
  echo "[ok] $name ready"
}

echo "[step] Starting Docker services (Redis + Qdrant)"
cd "$ROOT_DIR"
docker compose up -d

wait_http "Qdrant" "http://localhost:6333/healthz" 60

echo "[step] Ensuring Ollama is running"
if ! curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
  open -a Ollama || true
fi
wait_http "Ollama" "http://localhost:11434/api/tags" 120

echo "[step] Starting application processes"
start_process "api" "npm run dev:api"
start_process "worker" "npm run dev:worker"
start_process "web" "npm run dev:web"

wait_http "API" "http://localhost:3000/health" 90
wait_http "Web" "http://localhost:5173" 90

cat <<EOF

All services are up.
- Web:   http://localhost:5173
- API:   http://localhost:3000
- Logs:  $LOG_DIR

Useful commands:
- Stop all:   ./scripts/dev-down.sh
- Status:     ./scripts/dev-status.sh
EOF
