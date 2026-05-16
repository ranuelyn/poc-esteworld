/**
 * Converts parsed Esteworld patient records into SalesDialogue format
 * suitable for Qdrant RAG seeding.
 *
 * Uses sliding-window chunking: each patient conversation is split into
 * overlapping windows of ~10 messages. Each window becomes a separate
 * RAG point with focused, high-quality embeddings.
 */

import type { SalesDialogue, DialogueOutcome } from "../../domain/entities/SalesDialogue.js";
import type { PatientRecord, PatientMessage } from "./parseEsteworldCsv.js";
import { randomUUID } from "node:crypto";

export interface RagBuildOptions {
  tenantId?: string;
  clinicName?: string;
  windowSize?: number;    // messages per chunk
  windowOverlap?: number; // overlap between chunks
  minMessages?: number;   // minimum messages to include a record at all
}

const DEFAULT_OPTIONS: Required<RagBuildOptions> = {
  tenantId: "esteworld-istanbul",
  clinicName: "Esteworld Istanbul",
  windowSize: 10,
  windowOverlap: 3,
  minMessages: 4,
};

/**
 * Convert an array of parsed patient records into chunked SalesDialogue objects.
 * Each patient may produce multiple RAG points (one per conversation window).
 */
export function buildEsteworldRagDialogues(
  records: PatientRecord[],
  options: RagBuildOptions = {}
): SalesDialogue[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const dialogues: SalesDialogue[] = [];

  for (const record of records) {
    if (record.messages.length < opts.minMessages) continue;

    const chunks = chunkPatientRecord(record, opts);
    dialogues.push(...chunks);
  }

  return dialogues;
}

/**
 * Split a single patient record into multiple RAG-ready dialogue chunks
 * using a sliding window approach.
 */
function chunkPatientRecord(
  record: PatientRecord,
  opts: Required<RagBuildOptions>
): SalesDialogue[] {
  // Filter out media-only and trivially short messages first
  const usableMessages = record.messages.filter((m) => {
    const text = m.text.trim();
    return text.length >= 2 && !isMediaOnly(text);
  });

  if (usableMessages.length < opts.minMessages) return [];

  const language = detectLanguage(record);
  const treatment = normalizeTreatment(record.interest);
  const overallOutcome = detectOutcome(record);
  const overallTemperature = detectLeadTemperature(record);

  const chunks: SalesDialogue[] = [];
  const step = Math.max(1, opts.windowSize - opts.windowOverlap);

  // If the conversation is short enough, keep it as a single chunk
  if (usableMessages.length <= opts.windowSize + 2) {
    const dialogueText = formatMessages(usableMessages);
    if (!dialogueText.trim()) return [];

    chunks.push({
      id: randomUUID(),
      tenantId: opts.tenantId,
      clinicName: opts.clinicName,
      language,
      treatment,
      outcome: overallOutcome,
      leadTemperature: overallTemperature,
      dialogueText,
      salesNotes: buildChunkSalesNotes(record, 1, 1, usableMessages),
    });
    return chunks;
  }

  // Sliding window chunking
  let chunkIndex = 0;
  const totalChunks = Math.ceil((usableMessages.length - opts.windowSize) / step) + 1;

  for (let i = 0; i < usableMessages.length; i += step) {
    const windowMessages = usableMessages.slice(i, i + opts.windowSize);
    if (windowMessages.length < 3) break; // too small to be useful

    chunkIndex++;
    const dialogueText = formatMessages(windowMessages);
    if (!dialogueText.trim()) continue;

    // Detect chunk-level signals for more accurate embedding
    const chunkTemperature = detectChunkTemperature(windowMessages, overallTemperature);

    chunks.push({
      id: randomUUID(),
      tenantId: opts.tenantId,
      clinicName: opts.clinicName,
      language,
      treatment,
      outcome: overallOutcome,
      leadTemperature: chunkTemperature,
      dialogueText,
      salesNotes: buildChunkSalesNotes(record, chunkIndex, totalChunks, windowMessages),
    });
  }

  return chunks;
}

function formatMessages(messages: PatientMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.isAgent ? "Representative" : "Patient";
      return `${role}: ${msg.text.trim()}`;
    })
    .join("\n");
}

function buildChunkSalesNotes(
  record: PatientRecord,
  chunkIndex: number,
  totalChunks: number,
  windowMessages: PatientMessage[]
): string {
  const notes: string[] = [];

  // Chunk context
  if (totalChunks > 1) {
    notes.push(`Chunk ${chunkIndex}/${totalChunks} of patient ${record.patientId} (${record.patientName})`);
  } else {
    notes.push(`Patient ${record.patientId} (${record.patientName})`);
  }

  // Treatment info
  notes.push(`Treatment interest: ${record.interest}`);

  // Value
  if (record.value > 0) {
    notes.push(`Deal value: €${record.value.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`);
  }

  // Chunk-level message stats
  const agentMsgs = windowMessages.filter((m) => m.isAgent).length;
  const patientMsgs = windowMessages.filter((m) => !m.isAgent).length;
  notes.push(`Window: ${patientMsgs} patient + ${agentMsgs} agent messages`);

  // Chunk-level signals
  const signals = detectWindowSignals(windowMessages);
  if (signals.length > 0) {
    notes.push(`Signals: ${signals.join(", ")}`);
  }

  // Agent info
  if (record.agentNames.length > 0) {
    notes.push(`Handled by: ${record.agentNames.join(", ")}`);
  }

  return notes.join(". ");
}

function detectChunkTemperature(
  messages: PatientMessage[],
  fallback: "cold" | "warm" | "hot"
): "cold" | "warm" | "hot" {
  const allText = messages.map((m) => m.text.toLowerCase()).join(" ");
  let score = 0;

  if (/photo|fotoğraf|picture/.test(allText)) score += 15;
  if (/date|tarih|schedule|when.*come/.test(allText)) score += 15;
  if (/book|rezerv|confirm/.test(allText)) score += 20;
  if (/deposit|depozito|payment/.test(allText)) score += 25;
  if (/flight|uçak|ticket/.test(allText)) score += 15;

  if (/not interested|too expensive|cancel/.test(allText)) score -= 20;

  const patientMsgs = messages.filter((m) => !m.isAgent).length;
  if (patientMsgs >= 4) score += 10;
  else if (patientMsgs >= 2) score += 5;

  if (score >= 50) return "hot";
  if (score >= 25) return "warm";
  if (score > 0) return fallback; // use overall if ambiguous
  return "cold";
}

function detectWindowSignals(messages: PatientMessage[]): string[] {
  const signals: string[] = [];
  const allText = messages.map((m) => m.text.toLowerCase()).join(" ");

  if (/photo|fotoğraf|picture|image/.test(allText)) signals.push("photos");
  if (/deposit|depozito|payment|ödeme/.test(allText)) signals.push("payment");
  if (/flight|uçak|bilet|ticket/.test(allText)) signals.push("travel");
  if (/hotel|otel|transfer/.test(allText)) signals.push("logistics");
  if (/date|tarih|schedule|appointment/.test(allText)) signals.push("scheduling");
  if (/doctor|doktor|surgeon/.test(allText)) signals.push("medical");
  if (/price|discount|indirim/.test(allText)) signals.push("pricing");

  return signals.slice(0, 4);
}

function detectConversationSignals(record: PatientRecord): string[] {
  const signals: string[] = [];
  const allText = record.messages.map((m) => m.text.toLowerCase()).join(" ");

  if (/photo|fotoğraf|picture|image|jpeg|jpg|png/.test(allText)) {
    signals.push("photos shared or requested");
  }
  if (/deposit|depozito|payment|ödeme|pay/.test(allText)) {
    signals.push("deposit/payment discussed");
  }
  if (/flight|uçak|bilet|ticket|travel/.test(allText)) {
    signals.push("flight/travel logistics");
  }
  if (/hotel|otel|accommodation|transfer/.test(allText)) {
    signals.push("hotel/transfer arranged");
  }
  if (/date|tarih|schedule|appointment|randevu/.test(allText)) {
    signals.push("date scheduling");
  }
  if (/doctor|doktor|surgeon|dr\./.test(allText)) {
    signals.push("doctor consultation");
  }
  if (/discount|indirim|offer|teklif|price/.test(allText)) {
    signals.push("pricing/discount negotiation");
  }
  if (/before.*after|sonuç|result/.test(allText)) {
    signals.push("before/after results discussed");
  }
  if (/aftercare|bakım|check.*up/.test(allText)) {
    signals.push("aftercare mentioned");
  }
  if (/video.*call|görüntülü|consultation/.test(allText)) {
    signals.push("video consultation offered");
  }

  return signals.slice(0, 5);
}

function detectLanguage(record: PatientRecord): SalesDialogue["language"] {
  const patientTexts = record.messages
    .filter((m) => !m.isAgent)
    .map((m) => m.text)
    .join(" ");

  // Turkish detection
  const turkishChars = /[çğıöşüÇĞİÖŞÜ]/;
  const turkishWords = /\b(merhaba|teşekkür|ederim|günaydın|nasıl|istiyorum|lütfen)\b/i;
  if (turkishChars.test(patientTexts) || turkishWords.test(patientTexts)) {
    return "tr";
  }

  // Arabic detection
  if (/[\u0600-\u06FF]/.test(patientTexts)) {
    return "ar";
  }

  // German detection
  const germanWords = /\b(bitte|danke|guten|morgen|sprechen|können)\b/i;
  if (germanWords.test(patientTexts)) {
    return "de";
  }

  return "en";
}

function normalizeTreatment(interest: string): string {
  const lower = interest.toLowerCase();

  if (lower.includes("hair") || lower.includes("saç")) {
    return "Hair Transplant";
  }
  if (lower.includes("dental") || lower.includes("diş")) {
    return "Dental Treatment";
  }
  if (lower.includes("plastic") || lower.includes("plastik")) {
    return "Plastic Surgery";
  }
  if (lower.includes("aesthetic") || lower.includes("estetik")) {
    return "Medical Aesthetic";
  }

  return interest;
}

function detectOutcome(record: PatientRecord): DialogueOutcome {
  const allText = record.messages.map((m) => m.text.toLowerCase()).join(" ");

  // Strong signals for successful outcome — require CONCRETE purchase actions
  const successSignals = [
    /deposit.*paid|paid.*deposit|depozito.*ödendi/,
    /booked.*operation|operation.*booked|operasyon.*rezerv/,
    /confirmed.*date|date.*confirmed|tarih.*onay/,
    /flight.*booked|ticket.*booked|bilet.*alındı/,
    /see you.*istanbul|see you.*hospital|görüşürüz.*istanbul/,
    /welcome to.*esteworld|hoş geldiniz/,
    /your.*reservation.*confirmed/,
    /payment.*received|ödeme.*alındı|we have received/,
  ];

  const successScore = successSignals.filter((p) => p.test(allText)).length;

  // Also check for deposit/payment link signals from agent side
  const agentText = record.messages.filter((m) => m.isAgent).map((m) => m.text.toLowerCase()).join(" ");
  const hasPaymentLink = /paytr\.com|payment.*link|ödeme.*link/.test(agentText);
  const hasDepositConfirm = /deposit.*received|we have received|ödeme.*aldık/.test(agentText);

  const adjustedSuccessScore = successScore + (hasPaymentLink ? 1 : 0) + (hasDepositConfirm ? 1 : 0);

  // Need 3+ strong signals for "successful"
  if (adjustedSuccessScore >= 3) return "successful";

  // Lost signals — single signal is enough for some strong indicators
  const strongLostSignals = [
    /not interested|ilgilenmiyorum/,
    /cancel|iptal|refund/,
    /another clinic|başka klinik|went.*elsewhere/,
    /decided.*not|not.*going.*ahead/,
    /changed.*mind|vazgeçtim/,
  ];

  const weakLostSignals = [
    /too expensive|pahalı|cheaper/,
    /no.*thanks|hayır.*teşekkür/,
    /maybe.*later|belki.*sonra/,
    /still.*thinking|düşünüyorum/,
    /not.*sure|emin.*değil/,
  ];

  const strongLostScore = strongLostSignals.filter((p) => p.test(allText)).length;
  const weakLostScore = weakLostSignals.filter((p) => p.test(allText)).length;

  if (strongLostScore >= 1) return "lost";
  if (weakLostScore >= 2) return "lost";

  // Ghost pattern: last 3+ messages are all agent with no patient response
  const lastThree = record.messages.slice(-3);
  const ghostedByPatient = lastThree.length >= 3 && lastThree.every((m) => m.isAgent);

  // Long gap pattern: check if conversation ends with agent follow-ups
  const lastFive = record.messages.slice(-5);
  const agentEndCount = lastFive.filter((m) => m.isAgent).length;

  if (ghostedByPatient) return "lost";
  if (agentEndCount >= 4 && record.messages.length > 8) return "neutral";

  // Check engagement level
  const patientMsgs = record.messages.filter((m) => !m.isAgent).length;
  const agentMsgs = record.messages.filter((m) => m.isAgent).length;

  if (patientMsgs === 0) return "lost";

  // Only mark successful if strong engagement + concrete success signals
  if (agentMsgs > 0 && patientMsgs / agentMsgs > 0.6 && adjustedSuccessScore >= 2) return "successful";

  // Default to neutral — NOT successful
  return "neutral";
}

function detectLeadTemperature(record: PatientRecord): "cold" | "warm" | "hot" {
  const allText = record.messages.map((m) => m.text.toLowerCase()).join(" ");
  let score = 0;

  // Positive signals
  if (/photo|fotoğraf|picture/.test(allText)) score += 15;
  if (/date|tarih|schedule|when.*come|ne.*zaman/.test(allText)) score += 15;
  if (/book|rezerv|confirm/.test(allText)) score += 20;
  if (/deposit|depozito|payment/.test(allText)) score += 20;
  if (/flight|uçak|bilet|ticket/.test(allText)) score += 15;
  if (/hotel|otel|transfer/.test(allText)) score += 10;

  // Value signal
  if (record.value > 5000) score += 10;
  if (record.value > 3000) score += 5;

  // Engagement
  const patientMsgs = record.messages.filter((m) => !m.isAgent).length;
  if (patientMsgs >= 10) score += 15;
  else if (patientMsgs >= 5) score += 10;
  else if (patientMsgs >= 3) score += 5;

  // Negative signals
  if (/not interested|just asking|comparing|sadece sor/.test(allText)) score -= 15;
  if (/too expensive|pahalı|cheaper/.test(allText)) score -= 10;

  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

function isMediaOnly(text: string): boolean {
  const t = text.trim();
  // UUID-like image file names
  if (/^[a-f0-9-]+\.(jpeg|jpg|png|gif|mp4|pdf|webp)$/i.test(t)) return true;
  // Omitted media tags
  if (/^\[?(image|video|audio|sticker|document)\s*omitted\]?$/i.test(t)) return true;
  // Single emoji
  if (t.length <= 4 && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(t)) return true;
  return false;
}
