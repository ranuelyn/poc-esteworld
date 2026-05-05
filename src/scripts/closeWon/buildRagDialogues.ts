import { createHash, randomUUID } from "node:crypto";
import type { SalesDialogue } from "../../domain/entities/SalesDialogue.js";
import { formatTranscript, paragraphsToWhatsAppTurns } from "./whatsAppParagraphs.js";

const CASE_SPLIT = /\n(?=Patient\s*\d+)/i;

/** Max characters per chunk before sub-splitting (embedding / retrieval quality). */
const SOFT_CHUNK = 12_000;
const CHUNK_OVERLAP = 1_500;

export type RagLanguage = SalesDialogue["language"];

export interface BuildRagOptions {
  tenantId: string;
  clinicName: string;
  language: RagLanguage;
  leadTemperature: SalesDialogue["leadTemperature"];
  treatmentDefault: string;
  fullTranscript: string;
  sourceLabel: string;
}

/** Deterministic RFC-4122 UUID v4 bytes from content (stable re-seeds). */
function uuidV4FromSeed(seed: string): string {
  const digest = createHash("sha256").update(seed).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Split export into case blocks when Word uses "Patient 2.", "Patient 3 " markers;
 * then sub-chunk long blocks for better vector retrieval.
 */
export function buildRagDialogues(options: BuildRagOptions): SalesDialogue[] {
  const trimmed = options.fullTranscript.trim();
  if (!trimmed) {
    return [];
  }

  const caseBlocks = splitCaseBlocks(trimmed);
  const dialogues: SalesDialogue[] = [];

  for (let c = 0; c < caseBlocks.length; c += 1) {
    const block = caseBlocks[c]!.trim();
    if (!block) {
      continue;
    }
    const chunks = chunkByLength(block, SOFT_CHUNK, CHUNK_OVERLAP);
    for (let k = 0; k < chunks.length; k += 1) {
      const dialogueText = chunks[k]!;
      const treatment = inferTreatment(dialogueText, options.treatmentDefault);
      const salesNotes = buildSalesNotes(options.sourceLabel, c, caseBlocks.length, k, chunks.length, treatment);
      dialogues.push({
        id: uuidV4FromSeed(`${options.sourceLabel}:${c}:${k}:${dialogueText.slice(0, 2000)}`),
        tenantId: options.tenantId,
        clinicName: options.clinicName,
        language: options.language,
        treatment,
        outcome: "successful",
        leadTemperature: options.leadTemperature,
        dialogueText,
        salesNotes
      });
    }
  }

  if (dialogues.length === 0) {
    dialogues.push({
      id: randomUUID(),
      tenantId: options.tenantId,
      clinicName: options.clinicName,
      language: options.language,
      treatment: options.treatmentDefault,
      outcome: "successful",
      leadTemperature: options.leadTemperature,
      dialogueText: trimmed,
      salesNotes: `${options.sourceLabel}: single close-won excerpt for RAG. PII—anonymize in production.`
    });
  }

  return dialogues;
}

/**
 * Prefer structured turns (timestamps stripped) per case for cleaner embeddings.
 */
export function buildRagDialoguesFromParagraphs(
  paragraphs: string[],
  options: Omit<BuildRagOptions, "fullTranscript"> & { sourceLabel: string }
): SalesDialogue[] {
  const joined = paragraphs.join("\n").trim();
  if (!joined) {
    return [];
  }

  const caseBlocks = splitCaseBlocks(joined);
  const dialogues: SalesDialogue[] = [];

  for (let c = 0; c < caseBlocks.length; c += 1) {
    const block = caseBlocks[c]!.trim();
    if (!block) {
      continue;
    }
    const paras = block.split("\n").map((s) => s.trim()).filter(Boolean);
    const turns = paragraphsToWhatsAppTurns(paras);
    const structured = formatTranscript(turns).trim();
    if (!structured) {
      continue;
    }
    const chunks = chunkByLength(structured, SOFT_CHUNK, CHUNK_OVERLAP);
    for (let k = 0; k < chunks.length; k += 1) {
      const dialogueText = chunks[k]!;
      const treatment = inferTreatment(dialogueText, options.treatmentDefault);
      const salesNotes = buildSalesNotes(options.sourceLabel, c, caseBlocks.length, k, chunks.length, treatment);
      dialogues.push({
        id: uuidV4FromSeed(`${options.sourceLabel}:${c}:${k}:${dialogueText.slice(0, 2000)}`),
        tenantId: options.tenantId,
        clinicName: options.clinicName,
        language: options.language,
        treatment,
        outcome: "successful",
        leadTemperature: options.leadTemperature,
        dialogueText,
        salesNotes
      });
    }
  }

  if (dialogues.length === 0) {
    return buildRagDialogues({
      ...options,
      fullTranscript: joined
    });
  }

  return dialogues;
}

function splitCaseBlocks(text: string): string[] {
  const parts = text.split(CASE_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts;
  }
  return [text];
}

function chunkByLength(text: string, maxLen: number, overlap: number): string[] {
  if (text.length <= maxLen) {
    return [text];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxLen);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }
  return chunks.filter(Boolean);
}

function inferTreatment(text: string, fallback: string): string {
  const lower = text.toLowerCase();
  if (/\b(hair|graft|transplant|fue)\b/.test(lower)) {
    return "Hair transplant";
  }
  if (/\b(dental|veneer|tooth|teeth)\b/.test(lower)) {
    return "Dental treatment";
  }
  if (/\b(bbl|liposuction|breast|implant|augmentation)\b/.test(lower)) {
    return "Body contouring / breast surgery";
  }
  if (/\b(rhinoplasty|nose)\b/.test(lower)) {
    return "Rhinoplasty";
  }
  return fallback;
}

function buildSalesNotes(
  sourceLabel: string,
  caseIndex: number,
  caseCount: number,
  chunkIndex: number,
  chunkCount: number,
  treatment: string
): string {
  return [
    `Close-won export (${sourceLabel}) case ${caseIndex + 1}/${caseCount}, chunk ${chunkIndex + 1}/${chunkCount}.`,
    `Themes hint: ${treatment}.`,
    "Successful outcome assumed for RAG; PII may be present—anonymize before production."
  ].join(" ");
}
