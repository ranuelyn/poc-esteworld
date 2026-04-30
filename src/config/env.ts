import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().transform((value) => value || undefined),
  QDRANT_URL: z.url().default("http://localhost:6333"),
  QDRANT_COLLECTION: z.string().min(1).default("sales_dialogues"),
  QDRANT_VECTOR_SIZE: z.coerce.number().int().positive().default(1024),
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
  OLLAMA_LLM_MODEL: z.string().min(1).default("gemma4:e2b"),
  OLLAMA_EMBEDDING_MODEL: z.string().min(1).default("bge-m3"),
  OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  OLLAMA_NUM_CTX: z.coerce.number().int().positive().default(8192),
  CHAT_QUEUE_NAME: z.string().min(1).default("chat_queue"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  RAG_TOP_K: z.coerce.number().int().positive().default(3),
  MOCK_ZOHO_URL: z.url().default("http://localhost:3000/api/mock/zoho")
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
