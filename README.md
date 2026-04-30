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

## Multi-Tenant RAG Rule

All vectors live in a single Qdrant collection. Each point has a `tenant_id` payload, and searches always apply a mandatory tenant filter plus `outcome = successful`. This keeps the PoC close to a future multi-tenant SaaS design without creating one collection per clinic.
