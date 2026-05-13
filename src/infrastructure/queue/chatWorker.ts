import { Worker } from "bullmq";
import { ProcessChatMessage } from "../../application/use-cases/ProcessChatMessage.js";
import { env } from "../../config/env.js";
import { HttpLeadSink } from "../mock/InMemoryLeadSink.js";
import { GeminiLlmClient } from "../gemini/GeminiLlmClient.js";
import { OllamaEmbeddingClient } from "../ollama/OllamaEmbeddingClient.js";
import { OllamaLlmClient } from "../ollama/OllamaLlmClient.js";
import { QdrantRagRepository } from "../qdrant/QdrantRagRepository.js";
import { createRedisConnection, type ChatJobData } from "./bullmq.js";
import { logger } from "../../shared/logger.js";

const leadSink = new HttpLeadSink();

const llm = env.LLM_PROVIDER === "gemini" && env.GEMINI_API_KEY
  ? new GeminiLlmClient()
  : new OllamaLlmClient();

logger.info({ provider: env.LLM_PROVIDER === "gemini" && env.GEMINI_API_KEY ? "gemini" : "ollama" }, "LLM provider selected");

const processChatMessage = new ProcessChatMessage(
  new OllamaEmbeddingClient(),
  new QdrantRagRepository(),
  llm,
  leadSink,
  env.RAG_TOP_K
);

const worker = new Worker<ChatJobData>(
  env.CHAT_QUEUE_NAME,
  async (job) => {
    logger.info(
      {
        jobId: job.id,
        tenantId: job.data.tenantId,
        messageId: job.data.messageId
      },
      "Processing chat job"
    );

    const assessment = await processChatMessage.execute(job.data);

    logger.info(
      {
        jobId: job.id,
        tenantId: assessment.tenantId,
        messageId: assessment.messageId,
        leadTemperature: assessment.analysis.leadTemperature,
        leadScore: assessment.analysis.leadScore
      },
      "Chat job processed"
    );

    return assessment;
  },
  {
    connection: createRedisConnection(),
    concurrency: env.WORKER_CONCURRENCY
  }
);

worker.on("failed", (job, error) => {
  logger.error(
    {
      jobId: job?.id,
      failedReason: error.message,
      stack: error.stack
    },
    "Chat job failed"
  );

  if (job?.data.messageId) {
    void leadSink.fail(job.data.messageId, error.message).catch((failureError) => {
      logger.error(
        {
          jobId: job.id,
          failedReason: failureError.message
        },
        "Failed to report chat job failure"
      );
    });
  }
});

worker.on("ready", () => {
  logger.info(
    {
      queueName: env.CHAT_QUEUE_NAME,
      concurrency: env.WORKER_CONCURRENCY
    },
    "Chat worker started"
  );
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down worker");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
