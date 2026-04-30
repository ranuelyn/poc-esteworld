import type { ChatMessage } from "../../domain/entities/ChatMessage.js";
import type { ChatQueuePort } from "../../domain/ports/ChatQueuePort.js";

export class EnqueueWazzupMessage {
  constructor(private readonly chatQueue: ChatQueuePort) {}

  async execute(message: ChatMessage): Promise<{ jobId: string }> {
    const jobId = await this.chatQueue.enqueue(message);
    return { jobId };
  }
}
