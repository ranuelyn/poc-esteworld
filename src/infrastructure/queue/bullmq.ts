import { Queue, type JobsOptions } from "bullmq";
import type { ChatMessage } from "../../domain/entities/ChatMessage.js";
import type { ChatQueuePort } from "../../domain/ports/ChatQueuePort.js";
import { env } from "../../config/env.js";

export const CHAT_JOB_NAME = "process-chat-message";

export type ChatJobData = ChatMessage;

export function createRedisConnection() {
  const connection = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };

  if (env.REDIS_PASSWORD) {
    return {
      ...connection,
      password: env.REDIS_PASSWORD
    };
  }

  return connection;
}

export function createChatQueue(): Queue<ChatJobData> {
  return new Queue<ChatJobData>(env.CHAT_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: defaultChatJobOptions()
  });
}

export class BullMqChatQueue implements ChatQueuePort {
  constructor(private readonly queue: Queue<ChatJobData> = createChatQueue()) {}

  async enqueue(message: ChatMessage): Promise<string> {
    const job = await this.queue.add(CHAT_JOB_NAME, message, {
      jobId: toBullMqJobId(message.tenantId, message.messageId, message.receivedAt),
      ...defaultChatJobOptions()
    });

    return String(job.id);
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

function defaultChatJobOptions(): JobsOptions {
  return {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000
    },
    removeOnComplete: {
      age: 60 * 60,
      count: 1_000
    },
    removeOnFail: {
      age: 24 * 60 * 60
    }
  };
}

function toBullMqJobId(tenantId: string, messageId: string, receivedAt: string): string {
  return `${tenantId}-${messageId}-${receivedAt}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}
