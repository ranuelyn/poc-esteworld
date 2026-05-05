/**
 * Close-won / Wazzup export lines look like `Representative: …` and `Patient: …`.
 * Map to UI roles: patient (and phone channel) → lead, representative → agent.
 */
export interface ParsedConversationTurn {
  role: "lead" | "agent";
  text: string;
}

export function splitWazzupTranscriptToTurns(fullText: string): ParsedConversationTurn[] {
  const normalized = fullText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [{ role: "lead", text: fullText }];
  }

  const lines = normalized.split("\n");
  const messages: ParsedConversationTurn[] = [];
  let currentRole: "lead" | "agent" | null = null;
  const buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (!body || !currentRole) {
      return;
    }
    messages.push({ role: currentRole, text: body });
  };

  const speakerLine = /^(Representative|Patient|Phone):\s*(.*)$/i;

  for (const line of lines) {
    const m = speakerLine.exec(line);
    if (m?.[1]) {
      flush();
      const who = m[1].toLowerCase();
      currentRole = who === "representative" ? "agent" : "lead";
      buffer.length = 0;
      const rest = (m[2] ?? "").trim();
      if (rest) {
        buffer.push(rest);
      }
    } else if (currentRole) {
      buffer.push(line);
    }
  }

  flush();

  if (messages.length === 0) {
    return [{ role: "lead", text: normalized }];
  }

  return messages;
}

export function transcriptLooksLikeWazzupTurns(text: string): boolean {
  const t = text.replace(/\r\n/g, "\n");
  const hasRep = /(^|\n)Representative:\s*/i.test(t);
  const hasPat = /(^|\n)Patient:\s*/i.test(t);
  return hasRep && hasPat;
}
