export type LeadTemperature = "cold" | "warm" | "hot";

export type ReplyStyle = "professional" | "warm_trust" | "closing_focused";

export type SalesBoostType =
  | "shorter"
  | "more_trustworthy"
  | "more_persuasive"
  | "ask_for_photos"
  | "ask_travel_dates"
  | "ask_for_deposit"
  | "confirm_flights"
  | "make_softer";

export interface MessageAnalysis {
  language: string;
  treatment: string;
  intent: string;
  leadTemperature: LeadTemperature;
  leadScore: number;
  confidence: number;
  signals: string[];
}

export interface NextBestAction {
  title: string;
  rationale: string;
  evidence: string;
}

export interface SuggestedReply {
  id: string;
  style: ReplyStyle;
  label: string;
  text: string;
  isRecommended: boolean;
}

export interface SalesBoost {
  type: SalesBoostType;
  label: string;
  promptHint: string;
}

export interface SilencePlanStep {
  day: 1 | 3 | 7 | 14;
  action: string;
}

export interface LeadAssessment {
  tenantId: string;
  contactId: string;
  messageId: string;
  analysis: MessageAnalysis;
  nextBestAction: NextBestAction;
  suggestedReplies: SuggestedReply[];
  salesBoosts: SalesBoost[];
  silencePlan: SilencePlanStep[];
  leadTemperature: LeadTemperature;
  urgencyScore: number;
  intent: string;
  suggestedReply: string;
  rationale: string;
  followUpQuestions: string[];
  riskFlags: string[];
  retrievedDialogueIds: string[];
  createdAt: string;
}
