/**
 * End-to-end script to parse Esteworld CSV data and seed it into Qdrant.
 *
 * Usage:
 *   npm run seed:esteworld
 *   npm run seed:esteworld -- --limit 50
 *   npm run seed:esteworld -- --input path/to/csv --limit 100
 */

import { readFile } from "node:fs/promises";
import { parseEsteworldCsv } from "./parseEsteworldCsv.js";
import { buildEsteworldRagDialogues } from "./buildEsteworldRag.js";
import { OllamaEmbeddingClient } from "../../infrastructure/ollama/OllamaEmbeddingClient.js";
import { QdrantRagRepository } from "../../infrastructure/qdrant/QdrantRagRepository.js";
import { logger } from "../../shared/logger.js";

interface SeedArgs {
  input: string;
  limit: number;
  minMessages: number;
  tenantId: string;
  clinicName: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): SeedArgs {
  const defaults: SeedArgs = {
    input: "data/esteworld-data/Aggregated_Patient_Logs.csv",
    limit: 30,        // 30 richest patients ≈ ~1500-2000 RAG chunks (PoC-friendly)
    minMessages: 4,
    tenantId: "esteworld-istanbul",
    clinicName: "Esteworld Istanbul",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v) throw new Error(`Missing value after ${a}`);
      i += 1;
      return v;
    };

    switch (a) {
      case "--input": defaults.input = next(); break;
      case "--limit": defaults.limit = Number(next()); break;
      case "--min-messages": defaults.minMessages = Number(next()); break;
      case "--tenant-id": defaults.tenantId = next(); break;
      case "--clinic-name": defaults.clinicName = next(); break;
      case "--dry-run": defaults.dryRun = true; break;
    }
  }

  return defaults;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  logger.info(
    {
      input: args.input,
      limit: args.limit,
      minMessages: args.minMessages,
      dryRun: args.dryRun,
    },
    "Starting Esteworld data seeding"
  );

  // 1. Read and parse CSV
  const csvContent = await readFile(args.input, "utf8");
  const allRecords = parseEsteworldCsv(csvContent);

  logger.info(
    {
      totalRecords: allRecords.length,
      treatments: summarizeTreatments(allRecords),
    },
    "Parsed Esteworld CSV"
  );

  // 2. Sort by message count (richest conversations first) and limit
  const sorted = allRecords
    .filter((r) => r.messages.length >= args.minMessages)
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, args.limit);

  logger.info(
    {
      selected: sorted.length,
      avgMessages: Math.round(
        sorted.reduce((sum, r) => sum + r.messageCount, 0) / Math.max(sorted.length, 1)
      ),
      treatments: summarizeTreatments(sorted),
    },
    "Selected top patient records for RAG"
  );

  // 3. Build RAG dialogues
  const dialogues = buildEsteworldRagDialogues(sorted, {
    tenantId: args.tenantId,
    clinicName: args.clinicName,
    minMessages: args.minMessages,
  });

  logger.info(
    {
      dialogues: dialogues.length,
      outcomes: {
        successful: dialogues.filter((d) => d.outcome === "successful").length,
        neutral: dialogues.filter((d) => d.outcome === "neutral").length,
        lost: dialogues.filter((d) => d.outcome === "lost").length,
      },
      temperatures: {
        hot: dialogues.filter((d) => d.leadTemperature === "hot").length,
        warm: dialogues.filter((d) => d.leadTemperature === "warm").length,
        cold: dialogues.filter((d) => d.leadTemperature === "cold").length,
      },
    },
    "Built RAG dialogues"
  );

  if (args.dryRun) {
    logger.info("Dry run complete. No data was seeded.");
    // Print a few samples
    for (const d of dialogues.slice(0, 3)) {
      logger.info(
        {
          treatment: d.treatment,
          language: d.language,
          outcome: d.outcome,
          temperature: d.leadTemperature,
          dialogueLength: d.dialogueText.length,
          salesNotes: d.salesNotes.slice(0, 200),
        },
        "Sample dialogue"
      );
    }
    return;
  }

  // 4. Embed and seed
  const embeddingClient = new OllamaEmbeddingClient();
  const ragRepository = new QdrantRagRepository();

  logger.info({ count: dialogues.length }, "Embedding Esteworld dialogues...");

  const batchSize = 5;
  const allVectors: number[][] = [];

  for (let i = 0; i < dialogues.length; i += batchSize) {
    const batch = dialogues.slice(i, i + batchSize);
    const vectors = await Promise.all(
      batch.map((d) =>
        embeddingClient.embed(`${d.treatment}\n${d.dialogueText}\n${d.salesNotes}`)
      )
    );
    allVectors.push(...vectors);
    logger.info(
      { progress: `${Math.min(i + batchSize, dialogues.length)}/${dialogues.length}` },
      "Embedding progress"
    );
  }

  // 5. Upsert to Qdrant
  await ragRepository.upsertDialogues(dialogues, allVectors);

  logger.info(
    {
      count: dialogues.length,
      tenantId: args.tenantId,
    },
    "Esteworld dialogues seeded into Qdrant successfully"
  );
}

function summarizeTreatments(
  records: Array<{ interest: string }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    counts[r.interest] = (counts[r.interest] ?? 0) + 1;
  }
  return counts;
}

main().catch((error) => {
  logger.error({ err: error }, "Esteworld seed failed");
  process.exit(1);
});
