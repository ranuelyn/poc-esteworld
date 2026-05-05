# Esteworld AI Sales Assistant PoC

On-premise PoC for a healthcare tourism AI sales assistant. The API accepts Wazzup-like WhatsApp webhook payloads, immediately enqueues them in BullMQ, and lets a background worker run tenant-filtered RAG against Qdrant before asking Ollama for a sales representative Next-Best-Action.

## Prerequisites

- Node.js 20+
- Docker Desktop
- Ollama running locally
- Ollama models pulled locally, for example:

```bash
ollama pull gemma4:e2b
ollama pull bge-m3
```

Adjust model names in `.env` if your local Ollama tags differ.

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run seed
```

Run the API and worker in separate terminals:

```bash
npm run dev:api
npm run dev:worker
```

## Example Webhook

```bash
curl -X POST http://localhost:3000/api/webhook/wazzup \
  -H "content-type: application/json" \
  -d '{
    "tenant_id": "esteworld-istanbul",
    "clinic_name": "Esteworld Istanbul",
    "contact_id": "whatsapp:+905551112233",
    "patient_name": "Ayse",
    "message_id": "msg-1001",
    "text": "Merhaba, saç ekimi için bu ay fiyat ve uygun tarih almak istiyorum."
  }'
```

The endpoint returns `200 OK` after enqueueing. The worker posts the generated lead assessment to the mock Zoho endpoint:

```bash
curl http://localhost:3000/api/mock/zoho/leads
```

## Close-won WhatsApp DOCX export (fixtures)

All-in-one shell entrypoint (same style as `./scripts/dev-up.sh`):

```bash
./scripts/closewon.sh export              # → data/derived/* (segments, webhook single-thread, rag)
./scripts/closewon.sh replay              # needs API + worker
./scripts/closewon.sh seed                # Qdrant + Ollama; same as npm run closewon:seed
# npm run closewon:export | closewon:replay | closewon:seed
```

Exports like `CloseWon AI.docx` are Word copies of chats. Scripts turn them into **NDJSON webhook loads** (one job per inbound **Patient** segment, with a **cumulative** transcript in `text` so `buildSalesAssistantMessages` receives full-thread context) or a single **RAG JSON** snippet compatible with Qdrant seeding.

By default each patient step gets its own `message_id`, so the **Sales Copilot UI** shows one sidebar row per step. For a **single chat thread** in the UI, pass `--webhook-single-thread` when generating NDJSON (fixed `message_id` + `patient_name`), or set `CHAT_WEBHOOK_FIXED_MESSAGE_ID` when replaying an existing file.

Derived outputs contain **PII**; `data/derived/` is gitignored—regenerate locally as needed.

**1. Inspect segmentation (sanity checklist + JSON)**

```bash
npm run extract:closewon -- --input "data/CloseWon AI.docx" --format segments \
  --out data/derived/closewon-segments.json --preview 30
```

**2. NDJSON webhook replay (API + BullMQ worker must be running)**

```bash
npm run extract:closewon -- --input "data/CloseWon AI.docx" --format webhook \
  --out data/derived/closewon-webhooks.ndjson \
  --clinical-language-hint "English (UK)" \
  --treatment "Liposuction, BBL and breast augmentation" \
  --webhook-single-thread

CHAT_WEBHOOK_BASE=http://localhost:3000 CHAT_WEBHOOK_REPLAY_DELAY_MS=300 \
  npm run replay:closewon -- data/derived/closewon-webhooks.ndjson
```

Optional: without regenerating NDJSON, force one Copilot case during replay:

```bash
CHAT_WEBHOOK_FIXED_MESSAGE_ID=closewon-replay-thread \
  npm run replay:closewon -- data/derived/closewon-webhooks.ndjson
```

**3. RAG snippet + optional extra seed**

```bash
npm run extract:closewon -- --input "data/CloseWon AI.docx" --format rag \
  --out data/derived/closewon-rag.json --language en --lead-temperature hot

npm run seed -- --extra data/derived/closewon-rag.json
```

`npm run seed` embeds the default [`data/fake-sales-dialogues.json`](data/fake-sales-dialogues.json) plus any `--extra` JSON arrays of sales dialogues.

## Multi-Tenant RAG Rule

All vectors live in a single Qdrant collection. Each point has a `tenant_id` payload, and searches always apply a mandatory tenant filter plus `outcome = successful`. This keeps the PoC close to a future multi-tenant SaaS design without creating one collection per clinic.
