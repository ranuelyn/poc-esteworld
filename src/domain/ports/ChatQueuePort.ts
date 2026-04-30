import type { ChatMessage } from "../entities/ChatMessage.js";

export interface ChatQueuePort {
  enqueue(message: ChatMessage): Promise<string>;
}
