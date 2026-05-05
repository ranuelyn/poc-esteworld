export type DialogueSpeaker = "Representative" | "Patient" | "Phone";

export interface DialogueTurn {
  speaker: DialogueSpeaker;
  body: string;
}

const SPEAKER_LINE = /^(Representative|Patient|Phone):\s*(.*)$/i;
/** Word exports like `Patient 2. Hello...` */
const PATIENT_DOTTED_CASE = /^Patient\s+(\d+)\.\s*(.+)$/i;
/** e.g. `Patient 3 447...` — avoid `Patient 42 years`-style age lines */
const PATIENT_SPACE_CASE = /^Patient\s+(\d+)\s+(?!years\b)(.+)$/i;

export function splitIntoTurns(fullText: string): DialogueTurn[] {
  const normalized = fullText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const turns: DialogueTurn[] = [];
  let currentSpeaker: DialogueSpeaker | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentSpeaker) {
      return;
    }
    const body = buffer.join("\n").trim();
    if (body) {
      turns.push({ speaker: currentSpeaker, body });
    }
    currentSpeaker = null;
    buffer = [];
  };

  for (const line of lines) {
    let caseLine = PATIENT_DOTTED_CASE.exec(line);
    if (!caseLine) {
      caseLine = PATIENT_SPACE_CASE.exec(line);
    }
    if (caseLine?.[2]) {
      flush();
      currentSpeaker = "Patient";
      buffer = [caseLine[2].trim()];
      continue;
    }

    const m = SPEAKER_LINE.exec(line);
    if (m?.[1] && m[2] !== undefined) {
      flush();
      const speaker = normalizeSpeaker(m[1]);
      if (speaker) {
        currentSpeaker = speaker;
        buffer = [m[2]];
      }
    } else if (currentSpeaker) {
      buffer.push(line);
    }
  }

  flush();

  if (turns.length === 0 && normalized) {
    return [{ speaker: "Representative", body: normalized }];
  }

  return turns;
}

function normalizeSpeaker(raw: string): DialogueSpeaker | null {
  const key = raw.toLowerCase();
  if (key === "representative") {
    return "Representative";
  }
  if (key === "patient") {
    return "Patient";
  }
  if (key === "phone") {
    return "Phone";
  }
  return null;
}
