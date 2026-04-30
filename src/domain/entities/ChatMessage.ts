export type ChatChannel = "whatsapp" | "web" | "manual";

export interface ChatMessage {
  tenantId: string;
  clinicName?: string;
  channel: ChatChannel;
  contactId: string;
  messageId: string;
  patientName?: string;
  language?: string;
  treatment?: string;
  text: string;
  receivedAt: string;
  rawPayload?: unknown;
}
