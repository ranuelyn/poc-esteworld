import type { ChatMessage } from "../entities/ChatMessage.js";
import type { LeadAssessment } from "../entities/LeadAssessment.js";
import type { RetrievedSalesDialogue } from "../entities/SalesDialogue.js";

export interface LeadAssessmentDraft {
  analysis: LeadAssessment["analysis"];
  nextBestAction: LeadAssessment["nextBestAction"];
  suggestedReplies: LeadAssessment["suggestedReplies"];
  salesBoosts: LeadAssessment["salesBoosts"];
  silencePlan: LeadAssessment["silencePlan"];
  followUpQuestions: string[];
  riskFlags: string[];
}

export interface LeadAssessmentInput {
  message: ChatMessage;
  retrievedDialogues: RetrievedSalesDialogue[];
}

export interface LlmPort {
  generateLeadAssessment(input: LeadAssessmentInput): Promise<LeadAssessmentDraft>;
}
