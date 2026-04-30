import { EnqueueWazzupMessage } from "./application/use-cases/EnqueueWazzupMessage.js";
import { env } from "./config/env.js";
import { createServer } from "./infrastructure/http/server.js";
import { BullMqChatQueue } from "./infrastructure/queue/bullmq.js";
import { logger } from "./shared/logger.js";

const chatQueue = new BullMqChatQueue();
const enqueueWazzupMessage = new EnqueueWazzupMessage(chatQueue);
const app = createServer(enqueueWazzupMessage);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "AI Sales Assistant API started");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down API");
  server.close(async () => {
    await chatQueue.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
