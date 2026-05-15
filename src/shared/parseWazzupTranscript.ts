/**
 * Close-won / Wazzup export lines look like `Representative: …` and `Patient: …`.
 * Esteworld CSV demo lines look like `Sales representative (13.05.2025 15:47): …`
 * and `Lead (13.05.2025 15:47): …`.
 * Map to UI roles: patient/lead/phone → lead, representative/sales representative → agent.
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

  // Match both formats:
  //   "Representative: ..."  /  "Patient: ..."  /  "Phone: ..."
  //   "Sales representative (13.05.2025 15:47): ..."  /  "Lead (13.05.2025 15:47): ..."
  const speakerLine = /^(Sales\s+representative|Representative|Patient|Lead|Phone)(?:\s*\([^)]*\))?:\s*(.*)$/i;

  for (const line of lines) {
    const m = speakerLine.exec(line);
    if (m?.[1]) {
      flush();
      const who = m[1].toLowerCase();
      currentRole = (who === "representative" || who === "sales representative") ? "agent" : "lead";
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
  const hasRep = /(^|\n)(Sales\s+representative|Representative)(\s*\([^)]*\))?:\s*/i.test(t);
  const hasLead = /(^|\n)(Patient|Lead|Phone)(\s*\([^)]*\))?:\s*/i.test(t);
  return hasRep && hasLead;
}

