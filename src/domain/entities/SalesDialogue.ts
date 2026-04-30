export type DialogueOutcome = "successful" | "neutral" | "lost";

export interface SalesDialogue {
  id: string;
  tenantId: string;
  clinicName: string;
  language: "tr" | "en" | "ar" | "de" | "other";
  treatment: string;
  outcome: DialogueOutcome;
  leadTemperature: "cold" | "warm" | "hot";
  dialogueText: string;
  salesNotes: string;
}

export interface RetrievedSalesDialogue extends SalesDialogue {
  score: number;
}
