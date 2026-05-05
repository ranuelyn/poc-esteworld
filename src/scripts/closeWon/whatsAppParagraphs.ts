/**
 * Heuristic parser for Esteworld-style WhatsApp → Word exports where each
 * table cell / paragraph is a separate <w:p> (no "Representative:" labels).
 */

export type DialogueSpeaker = "Representative" | "Patient";

export interface DialogueTurn {
  speaker: DialogueSpeaker;
  body: string;
}

function classifyParagraph(p: string): "ts" | "phone" | "agent" | "case" | "text" {
  const t = p.trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    return "ts";
  }
  if (/^\+?[\d\s]{11,}$/.test(t.replace(/\s/g, ""))) {
    return "phone";
  }
  if (/^Patient\s*\d+/i.test(t)) {
    return "case";
  }
  if (isLikelyAgentDisplayName(t)) {
    return "agent";
  }
  return "text";
}

/** `Patient 3` + `447...` merged into one Word cell */
const PATIENT_PHONE_MERGED = /^Patient\s*(\d+)(\d{10,})$/i;

/**
 * After a `Patient N` row, optional continuation on the same line (Word merge).
 * Examples: `Patient 2. Hello…`, `Patient 5Sezer Aras`, `Patient 4 Phone`.
 */
export function parseCaseHeaderParagraph(p: string): { suffix: string | null } {
  const t = p.trim();
  if (PATIENT_PHONE_MERGED.test(t)) {
    return { suffix: null };
  }
  const m = /^Patient\s*\d+[\.\s]*(.*)$/i.exec(t);
  const rest = m?.[1]?.trim();
  return { suffix: rest && rest.length > 0 ? rest : null };
}

/** Two or three title-case name tokens, no digits — e.g. "Ibrahim Sarigul". */
function isLikelyAgentDisplayName(t: string): boolean {
  if (t.length < 3 || t.length > 60 || /\d/.test(t)) {
    return false;
  }
  if (/[.!?]/.test(t)) {
    return false;
  }
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) {
    return false;
  }
  return parts.every((w) => /^[A-ZÇĞİÖŞÜÁÉÍÓÚÂÊÎÔÛÄËÏÖÜŁ][a-zçğıöşüáéíóúâêîôûäëïöüł'-]*$/.test(w));
}

export function paragraphsToWhatsAppTurns(paragraphs: string[]): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  let i = 0;
  let speaker: "Representative" | "Patient" = "Representative";

  const appendTurn = (body: string) => {
    const b = body.trim();
    if (!b) {
      return;
    }
    turns.push({ speaker, body: b });
    speaker = speaker === "Representative" ? "Patient" : "Representative";
  };

  while (i < paragraphs.length) {
    const c = classifyParagraph(paragraphs[i]!);
    if (c === "case") {
      const raw = paragraphs[i]!.trim();
      i += 1;
      speaker = "Representative";
      if (PATIENT_PHONE_MERGED.test(raw)) {
        continue;
      }
      const { suffix } = parseCaseHeaderParagraph(raw);
      if (suffix) {
        appendTurn(suffix);
      }
      continue;
    }
    if (c === "ts" || c === "phone") {
      i += 1;
      continue;
    }
    if (c === "agent") {
      i += 1;
      speaker = "Representative";
      continue;
    }

    const parts: string[] = [];
    while (i < paragraphs.length) {
      const k = classifyParagraph(paragraphs[i]!);
      if (k === "ts") {
        i += 1;
        continue;
      }
      if (k === "phone" || k === "agent" || k === "case") {
        break;
      }
      parts.push(paragraphs[i]!);
      i += 1;
    }
    appendTurn(parts.join("\n"));
  }

  return turns;
}

export function formatTranscript(turns: { speaker: string; body: string }[]): string {
  return turns.map((t) => `${t.speaker}: ${t.body}`).join("\n");
}

export interface WebhookSegmentRow {
  tenant_id: string;
  clinic_name: string;
  contact_id: string;
  message_id: string;
  text: string;
  timestamp: string;
  language: string;
  treatment: string;
  /** Sohbet başlığında “Unknown lead” yerine gösterilir (Wazzup şeması opsiyonel alan). */
  patient_name?: string;
}

export function buildCumulativeWebhookRows(
  turns: { speaker: string; body: string }[],
  options: {
    tenantId: string;
    clinicName: string;
    contactId: string;
    languageHint: string;
    treatment: string;
    baseTimeMs: number;
    stepMs: number;
    /** Aynı id ile tüm satırlar gönderilir → Copilot’ta tek sohbet satırı (UI için). */
    fixedMessageId?: string;
    patientName?: string;
  }
): WebhookSegmentRow[] {
  const rows: WebhookSegmentRow[] = [];
  const slice: { speaker: string; body: string }[] = [];
  let patientIndex = 0;

  for (const turn of turns) {
    slice.push(turn);
    if (turn.speaker !== "Patient") {
      continue;
    }
    patientIndex += 1;
    const text = formatTranscript(slice);
    const ts = new Date(options.baseTimeMs + patientIndex * options.stepMs).toISOString();
    const messageId =
      options.fixedMessageId ?? `closewon-${String(patientIndex).padStart(4, "0")}`;
    const row: WebhookSegmentRow = {
      tenant_id: options.tenantId,
      clinic_name: options.clinicName,
      contact_id: options.contactId,
      message_id: messageId,
      text,
      timestamp: ts,
      language: options.languageHint,
      treatment: options.treatment
    };
    if (options.patientName) {
      row.patient_name = options.patientName;
    }
    rows.push(row);
  }

  return rows;
}
