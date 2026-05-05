import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { buildRagDialoguesFromParagraphs, type RagLanguage } from "./closeWon/buildRagDialogues.js";
import {
  normalizeTranscriptLineBreaks,
  readDocxParagraphs
} from "./closeWon/parseDocxPlainText.js";
import { splitIntoTurns } from "./closeWon/segmentTurns.js";
import {
  buildCumulativeWebhookRows,
  formatTranscript,
  paragraphsToWhatsAppTurns,
  type WebhookSegmentRow
} from "./closeWon/whatsAppParagraphs.js";
import { logger } from "../shared/logger.js";

type ExportFormat = "segments" | "webhook" | "rag";

interface ParsedArgs {
  input: string;
  format: ExportFormat;
  out: string;
  preview: number;
  clinicalLanguageHint: string;
  treatment: string;
  language: RagLanguage;
  leadTemperature: "cold" | "warm" | "hot";
  tenantId: string;
  clinicName: string;
  contactId: string | null;
  webhookSingleThread: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const defaults: Omit<ParsedArgs, "input" | "format" | "out"> = {
    preview: 30,
    clinicalLanguageHint: "English (UK)",
    treatment: "Multi-treatment close-won export",
    language: "en",
    leadTemperature: "hot",
    tenantId: "esteworld-istanbul",
    clinicName: "Esteworld Istanbul",
    contactId: null,
    webhookSingleThread: false
  };

  const out: Partial<ParsedArgs> = { ...defaults };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v) {
        throw new Error(`Missing value after ${a}`);
      }
      i += 1;
      return v;
    };

    switch (a) {
      case "--input":
        out.input = next();
        break;
      case "--format":
        out.format = next() as ExportFormat;
        break;
      case "--out":
        out.out = next();
        break;
      case "--preview":
        out.preview = Number(next());
        break;
      case "--clinical-language-hint":
        out.clinicalLanguageHint = next();
        break;
      case "--treatment":
        out.treatment = next();
        break;
      case "--language":
        out.language = next() as RagLanguage;
        break;
      case "--lead-temperature":
        out.leadTemperature = next() as ParsedArgs["leadTemperature"];
        break;
      case "--tenant-id":
        out.tenantId = next();
        break;
      case "--clinic-name":
        out.clinicName = next();
        break;
      case "--contact-id":
        out.contactId = next();
        break;
      case "--webhook-single-thread":
        out.webhookSingleThread = true;
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (!out.input || !out.format || !out.out) {
    throw new Error(
      "Usage: tsx src/scripts/exportCloseWonDocx.ts --input <docx> --format segments|webhook|rag --out <path> [--preview N] [--clinical-language-hint] [--treatment] [--language tr|en|ar|de|other] [--lead-temperature cold|warm|hot] [--tenant-id] [--clinic-name] [--contact-id] [--webhook-single-thread]"
    );
  }

  if (!["segments", "webhook", "rag"].includes(out.format)) {
    throw new Error(`Invalid --format: ${out.format}`);
  }

  return out as ParsedArgs;
}

function defaultContactId(inputPath: string): string {
  const base = basename(inputPath).replace(/[^a-zA-Z0-9]+/g, "").slice(0, 24);
  return `whatsapp:+closewon-${base || "export"}`;
}

function resolveTurns(paragraphs: string[]) {
  const joined = normalizeTranscriptLineBreaks(paragraphs.join("\n"));
  const labeledTurns = splitIntoTurns(joined);
  const useWhatsAppHeuristic = paragraphs.length > 60 && labeledTurns.length < 16;
  const turns = useWhatsAppHeuristic ? paragraphsToWhatsAppTurns(paragraphs) : labeledTurns;
  return { turns, parser: useWhatsAppHeuristic ? "whatsapp_cells" : "labeled_lines" as const };
}

async function writeOut(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const paragraphs = await readDocxParagraphs(args.input);
  const { turns, parser } = resolveTurns(paragraphs);
  const plainJoined = paragraphs.join("\n");
  const contactId = args.contactId ?? defaultContactId(args.input);
  const sourceLabel = basename(args.input);

  if (args.format === "segments") {
    const previewCount = Math.max(1, args.preview);
    const preview = turns.slice(0, previewCount).map((turn, index) => ({
      turnIndex: index,
      speaker: turn.speaker,
      excerpt: turn.body.length > 200 ? `${turn.body.slice(0, 200)}…` : turn.body,
      cumulativeLength: formatTranscript(turns.slice(0, index + 1)).length
    }));

    const patientTurns = turns.filter((t) => t.speaker === "Patient").length;
    const report = {
      source: pathToFileURL(args.input).href,
      stats: {
        docxParagraphs: paragraphs.length,
        charactersJoined: plainJoined.length,
        turns: turns.length,
        patientTurns,
        parser
      },
      preview
    };

    await writeOut(args.out, `${JSON.stringify(report, null, 2)}\n`);
    logger.info(
      {
        out: args.out,
        turns: turns.length,
        patientTurns,
        previewed: preview.length,
        parser
      },
      "Wrote segmentation report"
    );
    return;
  }

  if (args.format === "webhook") {
    const baseTimeMs = Date.now();
    const stepMs = 2_000;
    const webhookOpts = {
      tenantId: args.tenantId,
      clinicName: args.clinicName,
      contactId,
      languageHint: args.clinicalLanguageHint,
      treatment: args.treatment,
      baseTimeMs,
      stepMs,
      ...(args.webhookSingleThread
        ? { fixedMessageId: "closewon-replay-thread" as const, patientName: "Close-won replay" as const }
        : {})
    };
    const rows: WebhookSegmentRow[] = buildCumulativeWebhookRows(turns, webhookOpts);

    const ndjson = rows.map((row) => JSON.stringify(row)).join("\n");
    await writeOut(args.out, ndjson ? `${ndjson}\n` : "");
    logger.info({ out: args.out, rows: rows.length, parser }, "Wrote webhook NDJSON");
    return;
  }

  if (args.format === "rag") {
    const dialogues = buildRagDialoguesFromParagraphs(paragraphs, {
      tenantId: args.tenantId,
      clinicName: args.clinicName,
      language: args.language,
      leadTemperature: args.leadTemperature,
      treatmentDefault: args.treatment,
      sourceLabel
    });

    await writeOut(args.out, `${JSON.stringify(dialogues, null, 2)}\n`);
    logger.info({ out: args.out, dialogues: dialogues.length, parser }, "Wrote RAG JSON");
  }
}

main().catch((error) => {
  logger.error({ err: error }, "exportCloseWonDocx failed");
  process.exit(1);
});
