import type { RetrievedSalesDialogue, SalesDialogue } from "../entities/SalesDialogue.js";

export interface SimilarDialogueSearch {
  tenantId: string;
  vector: number[];
  limit: number;
}

export interface RagRepositoryPort {
  ensureCollection(): Promise<void>;
  upsertDialogues(dialogues: SalesDialogue[], vectors: number[][]): Promise<void>;
  searchSimilarSuccessfulDialogues(input: SimilarDialogueSearch): Promise<RetrievedSalesDialogue[]>;
}
