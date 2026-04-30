import { QdrantClient } from "@qdrant/js-client-rest";
import type {
  RetrievedSalesDialogue,
  SalesDialogue
} from "../../domain/entities/SalesDialogue.js";
import type {
  RagRepositoryPort,
  SimilarDialogueSearch
} from "../../domain/ports/RagRepositoryPort.js";
import { env } from "../../config/env.js";

type SalesDialoguePayload = {
  tenant_id: string;
  clinic_name: string;
  language: SalesDialogue["language"];
  treatment: string;
  outcome: SalesDialogue["outcome"];
  lead_temperature: SalesDialogue["leadTemperature"];
  dialogue_text: string;
  sales_notes: string;
};

export class QdrantRagRepository implements RagRepositoryPort {
  private readonly client: QdrantClient;

  constructor(
    private readonly collectionName = env.QDRANT_COLLECTION,
    private readonly vectorSize = env.QDRANT_VECTOR_SIZE,
    qdrantUrl = env.QDRANT_URL
  ) {
    this.client = new QdrantClient({ url: qdrantUrl });
  }

  async ensureCollection(): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(
      (collection) => collection.name === this.collectionName
    );

    if (exists) {
      return;
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: this.vectorSize,
        distance: "Cosine"
      }
    });

    await this.client.createPayloadIndex(this.collectionName, {
      field_name: "tenant_id",
      field_schema: "keyword"
    });
  }

  async upsertDialogues(dialogues: SalesDialogue[], vectors: number[][]): Promise<void> {
    if (dialogues.length !== vectors.length) {
      throw new Error("Dialogues and vectors length mismatch.");
    }

    await this.ensureCollection();

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: dialogues.map((dialogue, index) => {
        const vector = vectors[index];
        if (!vector) {
          throw new Error(`Missing vector for dialogue ${dialogue.id}.`);
        }

        return {
          id: dialogue.id,
          vector,
          payload: this.toPayload(dialogue)
        };
      })
    });
  }

  async searchSimilarSuccessfulDialogues(
    input: SimilarDialogueSearch
  ): Promise<RetrievedSalesDialogue[]> {
    await this.ensureCollection();

    const results = await this.client.search(this.collectionName, {
      vector: input.vector,
      limit: input.limit,
      with_payload: true,
      filter: {
        must: [
          {
            key: "tenant_id",
            match: {
              value: input.tenantId
            }
          },
          {
            key: "outcome",
            match: {
              value: "successful"
            }
          }
        ]
      }
    });

    return results.map((result) => {
      const payload = result.payload as SalesDialoguePayload | undefined;
      if (!payload) {
        throw new Error("Qdrant result is missing payload.");
      }

      return {
        id: String(result.id),
        tenantId: payload.tenant_id,
        clinicName: payload.clinic_name,
        language: payload.language,
        treatment: payload.treatment,
        outcome: payload.outcome,
        leadTemperature: payload.lead_temperature,
        dialogueText: payload.dialogue_text,
        salesNotes: payload.sales_notes,
        score: result.score
      };
    });
  }

  private toPayload(dialogue: SalesDialogue): SalesDialoguePayload {
    return {
      tenant_id: dialogue.tenantId,
      clinic_name: dialogue.clinicName,
      language: dialogue.language,
      treatment: dialogue.treatment,
      outcome: dialogue.outcome,
      lead_temperature: dialogue.leadTemperature,
      dialogue_text: dialogue.dialogueText,
      sales_notes: dialogue.salesNotes
    };
  }
}
