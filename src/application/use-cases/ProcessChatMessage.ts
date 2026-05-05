import type { ChatMessage } from "../../domain/entities/ChatMessage.js";
import type { LeadAssessment } from "../../domain/entities/LeadAssessment.js";
import type { EmbeddingPort } from "../../domain/ports/EmbeddingPort.js";
import type { LeadSinkPort } from "../../domain/ports/LeadSinkPort.js";
import type { LlmPort } from "../../domain/ports/LlmPort.js";
import type { RagRepositoryPort } from "../../domain/ports/RagRepositoryPort.js";

export class ProcessChatMessage {
  constructor(
    private readonly embeddings: EmbeddingPort,
    private readonly ragRepository: RagRepositoryPort,
    private readonly llm: LlmPort,
    private readonly leadSink: LeadSinkPort,
    private readonly topK: number
  ) {}

  async execute(message: ChatMessage): Promise<LeadAssessment> {
    const queryVector = await this.embeddings.embed(message.text);
    const retrievedDialogues = await this.ragRepository.searchSimilarSuccessfulDialogues({
      tenantId: message.tenantId,
      vector: queryVector,
      limit: this.topK
    });

    const assessmentDraft = await this.llm.generateLeadAssessment({
      message,
      retrievedDialogues
    });

    const assessment: LeadAssessment = {
      ...assessmentDraft,
      tenantId: message.tenantId,
      contactId: message.contactId,
      messageId: message.messageId,
      sourceMessageText: message.text,
      leadTemperature: assessmentDraft.analysis.leadTemperature,
      urgencyScore: Math.max(1, Math.ceil(assessmentDraft.analysis.leadScore / 10)),
      intent: assessmentDraft.analysis.intent,
      suggestedReply:
        assessmentDraft.suggestedReplies.find((reply) => reply.isRecommended)?.text ??
        assessmentDraft.suggestedReplies[0]?.text ??
        "",
      rationale: assessmentDraft.nextBestAction.rationale,
      retrievedDialogueIds: retrievedDialogues.map((dialogue) => dialogue.id),
      createdAt: new Date().toISOString()
    };

    await this.leadSink.save(assessment);
    return assessment;
  }
}
