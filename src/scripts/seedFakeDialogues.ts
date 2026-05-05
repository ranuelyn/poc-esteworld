import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { SalesDialogue } from "../domain/entities/SalesDialogue.js";
import { OllamaEmbeddingClient } from "../infrastructure/ollama/OllamaEmbeddingClient.js";
import { QdrantRagRepository } from "../infrastructure/qdrant/QdrantRagRepository.js";
import { logger } from "../shared/logger.js";

const salesDialogueSchema = z.object({
  id: z.uuid(),
  tenantId: z.string().min(1),
  clinicName: z.string().min(1),
  language: z.enum(["tr", "en", "ar", "de", "other"]),
  treatment: z.string().min(1),
  outcome: z.enum(["successful", "neutral", "lost"]),
  leadTemperature: z.enum(["cold", "warm", "hot"]),
  dialogueText: z.string().min(1),
  salesNotes: z.string().min(1)
});

const salesDialoguesSchema = z.array(salesDialogueSchema);

async function main() {
  const extraPaths: string[] = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === "--extra") {
      const next = process.argv[i + 1];
      if (next) extraPaths.push(next);
      i += 1;
    }
  }

  const fileUrl = new URL("../../data/fake-sales-dialogues.json", import.meta.url);
  const raw = await readFile(fileUrl, "utf8");
  let dialogues = salesDialoguesSchema.parse(JSON.parse(raw)) satisfies SalesDialogue[];

  if (extraPaths.length > 0) {
    const extraRows: SalesDialogue[] = [];
    for (const fsPath of extraPaths) {
      const extraRaw = await readFile(fsPath, "utf8");
      const parsed = JSON.parse(extraRaw);
      extraRows.push(...salesDialoguesSchema.parse(parsed));
    }
    dialogues = [...dialogues, ...extraRows];
  }

  const embeddingClient = new OllamaEmbeddingClient();
  const ragRepository = new QdrantRagRepository();

  logger.info(
    {
      count: dialogues.length,
      extraFiles: extraPaths.length ? extraPaths : undefined
    },
    "Embedding fake sales dialogues"
  );

  const vectors = await Promise.all(
    dialogues.map((dialogue) =>
      embeddingClient.embed(`${dialogue.treatment}\n${dialogue.dialogueText}\n${dialogue.salesNotes}`)
    )
  );

  await ragRepository.upsertDialogues(dialogues, vectors);

  logger.info(
    {
      count: dialogues.length,
      tenants: [...new Set(dialogues.map((dialogue) => dialogue.tenantId))]
    },
    "Fake sales dialogues seeded into Qdrant"
  );
}

main().catch((error) => {
  logger.error({ err: error }, "Failed to seed fake dialogues");
  process.exit(1);
});
