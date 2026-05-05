#!/usr/bin/env bash
# Close-won DOCX → derived fixtures (segments, webhook NDJSON, RAG JSON) + replay/seed helpers.
# Env: CLOSEWON_INPUT, CLOSEWON_TREATMENT, CLOSEWON_LANGUAGE_HINT, CHAT_WEBHOOK_BASE, CHAT_WEBHOOK_REPLAY_DELAY_MS
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INPUT_DEFAULT="${CLOSEWON_INPUT:-data/CloseWon AI.docx}"
TREAT="${CLOSEWON_TREATMENT:-Multi-treatment close-won export}"
HINT="${CLOSEWON_LANGUAGE_HINT:-English (UK)}"
DERIVED="data/derived"

usage() {
  echo "Usage: $0 {export|replay|seed} [path/to/CloseWon.docx]" >&2
  echo "  export  — writes $DERIVED/closewon-segments.json, closewon-webhooks.ndjson, closewon-rag.json" >&2
  echo "  replay  — POSTs closewon-webhooks.ndjson (API must be up; CHAT_WEBHOOK_BASE defaults to http://localhost:3000)" >&2
  echo "  seed    — npm run seed -- --extra closewon-rag.json (Ollama + Qdrant)" >&2
  exit 1
}

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  usage
fi
shift || true

case "$cmd" in
  export)
    INPUT_PATH="${1:-$INPUT_DEFAULT}"
    mkdir -p "$DERIVED"
    echo "[closewon] segments <- $INPUT_PATH"
    npm run extract:closewon -- --input "$INPUT_PATH" --format segments \
      --out "$DERIVED/closewon-segments.json" --preview 30
    echo "[closewon] webhook (single thread) <- $INPUT_PATH"
    npm run extract:closewon -- --input "$INPUT_PATH" --format webhook \
      --out "$DERIVED/closewon-webhooks.ndjson" \
      --clinical-language-hint "$HINT" \
      --treatment "$TREAT" \
      --webhook-single-thread
    echo "[closewon] rag JSON <- $INPUT_PATH"
    npm run extract:closewon -- --input "$INPUT_PATH" --format rag \
      --out "$DERIVED/closewon-rag.json" --language en --lead-temperature hot \
      --treatment "$TREAT"
    echo "[ok] $DERIVED/closewon-{segments,webhooks.ndjson,rag.json}"
    ;;
  replay)
    export CHAT_WEBHOOK_BASE="${CHAT_WEBHOOK_BASE:-http://localhost:3000}"
    export CHAT_WEBHOOK_REPLAY_DELAY_MS="${CHAT_WEBHOOK_REPLAY_DELAY_MS:-300}"
    NDJSON="${1:-$DERIVED/closewon-webhooks.ndjson}"
    echo "[closewon] replay -> $CHAT_WEBHOOK_BASE ($NDJSON)"
    npm run replay:closewon -- "$NDJSON"
    ;;
  seed)
    RAG="${1:-$DERIVED/closewon-rag.json}"
    echo "[closewon] seed + extra $RAG"
    npm run seed -- --extra "$RAG"
    ;;
  *)
    usage
    ;;
esac
