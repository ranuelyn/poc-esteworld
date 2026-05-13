/**
 * Parses Esteworld's Aggregated_Patient_Logs.csv into structured patient records.
 *
 * The CSV uses a custom block format:
 *   --- START PATIENT RECORD ---
 *   PATIENT INFO,ID: D10012 | Name: Janet cox,"Interest: Plastic Surgery | Value: € 7,927.38"
 *   LOG,Ben (13.05.2025 15:47),"Hello Janet..."
 *   --- END PATIENT RECORD ---
 */

export interface PatientMessage {
  sender: string;
  timestamp: string;     // ISO 8601
  rawTimestamp: string;   // "13.05.2025 15:47"
  text: string;
  isAgent: boolean;
}

export interface PatientRecord {
  patientId: string;
  patientName: string;
  interest: string;        // "Plastic Surgery", "Hair Transplant", "Dental Treatment", etc.
  value: number;           // euro amount
  valueCurrency: string;   // "EUR"
  messages: PatientMessage[];
  agentNames: string[];    // detected Esteworld staff names
  messageCount: number;
  firstMessageAt: string;  // ISO
  lastMessageAt: string;   // ISO
}

const KNOWN_AGENT_PATTERNS = [
  /^esteworld/i,
  /^esteworldturkey/i,
  /^sai esteworld/i,
  /^daria esteworld/i,
  /^cemre.*esteworld/i,
  /^esteworld.*london/i,
  /^esteworld.*clinic/i,
  /^esteworld.*klinik/i,
  /^esteworld.*ibrahim/i,
  /^esteworld.*ck/i,
  /esteworld/i,
  // Known individual agent names from data analysis
  /^ben$/i,
  /^süreyya\s*kasap$/i,
  /^saliha\s*bey$/i,
  /^cemre\s*duru/i,
  /^mert\s*vural/i,
  /^alper\s*leonardo/i,
  /^juliana\s*adams$/i,
  /^mohammed\s*adams$/i,
];

const PHONE_NUMBER_PATTERN = /^(\+?\d{10,15}|\d{10,15})$/;

/**
 * Parse the raw CSV content into structured patient records.
 */
export function parseEsteworldCsv(csvContent: string): PatientRecord[] {
  const records: PatientRecord[] = [];
  const blocks = csvContent.split("--- START PATIENT RECORD ---");

  for (const block of blocks) {
    const endIndex = block.indexOf("--- END PATIENT RECORD ---");
    if (endIndex === -1) continue;

    const recordContent = block.slice(0, endIndex).trim();
    if (!recordContent) continue;

    const record = parsePatientBlock(recordContent);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

function parsePatientBlock(content: string): PatientRecord | null {
  const lines = content.split("\n").map((l) => l.replace(/\r$/, ""));

  // Find PATIENT INFO line
  const infoLine = lines.find((l) => l.startsWith("PATIENT INFO,"));
  if (!infoLine) return null;

  const { patientId, patientName, interest, value } = parsePatientInfo(infoLine);
  if (!patientId || !patientName) return null;

  // Collect all LOG lines (handling multi-line messages)
  const messages = collectLogMessages(lines, patientName);
  if (messages.length === 0) return null;

  // Detect agent names
  const agentNames = detectAgentNames(messages, patientName);

  // Mark agent messages
  for (const msg of messages) {
    msg.isAgent = isAgentSender(msg.sender, patientName, agentNames);
  }

  const timestamps = messages
    .map((m) => m.timestamp)
    .filter((t) => t !== "");

  return {
    patientId,
    patientName,
    interest,
    value,
    valueCurrency: "EUR",
    messages,
    agentNames,
    messageCount: messages.length,
    firstMessageAt: timestamps[0] ?? "",
    lastMessageAt: timestamps.at(-1) ?? "",
  };
}

function parsePatientInfo(line: string): {
  patientId: string;
  patientName: string;
  interest: string;
  value: number;
} {
  // PATIENT INFO,ID: D10012 | Name: Janet cox,"Interest: Plastic Surgery | Value: € 7,927.38"
  const idMatch = /ID:\s*(\S+)/.exec(line);
  const nameMatch = /Name:\s*([^,|"]+)/.exec(line);
  const interestMatch = /Interest:\s*([^|"]+)/.exec(line);
  const valueMatch = /Value:\s*€\s*([\d,. ]+)/.exec(line);

  const patientId = idMatch?.[1]?.trim() ?? "";
  const patientName = nameMatch?.[1]?.trim() ?? "";
  const interest = interestMatch?.[1]?.trim() ?? "Other";
  const valueStr = valueMatch?.[1]?.replace(/\s/g, "").replace(",", "") ?? "0";
  const value = parseFloat(valueStr) || 0;

  return { patientId, patientName, interest, value };
}

function collectLogMessages(lines: string[], _patientName: string): PatientMessage[] {
  const messages: PatientMessage[] = [];
  let currentSender = "";
  let currentTimestamp = "";
  let currentRawTimestamp = "";
  let currentTextParts: string[] = [];
  let inLogMessage = false;

  // Pattern: LOG,SenderName (DD.MM.YYYY HH:MM),MessageContent
  const logPattern = /^LOG,(.+?)\s*\((\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})\)\s*,\s*(.*)/;

  for (const line of lines) {
    const match = logPattern.exec(line);
    if (match) {
      // Flush previous message
      if (inLogMessage && currentSender) {
        messages.push({
          sender: currentSender,
          timestamp: currentTimestamp,
          rawTimestamp: currentRawTimestamp,
          text: currentTextParts.join("\n").trim(),
          isAgent: false, // will be set later
        });
      }

      currentSender = match[1]?.trim() ?? "";
      currentRawTimestamp = match[2]?.trim() ?? "";
      currentTimestamp = parseEsteworldDate(currentRawTimestamp);
      const messageStart = match[3] ?? "";
      // Handle quoted messages (strip leading/trailing quotes)
      currentTextParts = [stripQuotes(messageStart)];
      inLogMessage = true;
    } else if (inLogMessage && !line.startsWith("PATIENT INFO,") &&
               !line.startsWith("CONVERSATION LOG,") &&
               !line.startsWith("---,") &&
               !line.startsWith("--- ") &&
               line.trim() !== ",,") {
      // Continuation of multi-line message
      currentTextParts.push(stripQuotes(line));
    }
  }

  // Flush last message
  if (inLogMessage && currentSender) {
    messages.push({
      sender: currentSender,
      timestamp: currentTimestamp,
      rawTimestamp: currentRawTimestamp,
      text: currentTextParts.join("\n").trim(),
      isAgent: false,
    });
  }

  return messages;
}

function detectAgentNames(messages: PatientMessage[], patientName: string): string[] {
  const senderCounts = new Map<string, number>();
  for (const msg of messages) {
    senderCounts.set(msg.sender, (senderCounts.get(msg.sender) ?? 0) + 1);
  }

  const agents = new Set<string>();
  const patientNameLower = patientName.toLowerCase().trim();

  for (const [sender] of senderCounts) {
    const senderLower = sender.toLowerCase().trim();

    // Skip if sender name matches or contains the patient name
    if (senderLower === patientNameLower) continue;
    if (patientNameLower.includes(senderLower) || senderLower.includes(patientNameLower)) continue;

    // Skip phone numbers (these are usually patients from different channels)
    if (PHONE_NUMBER_PATTERN.test(sender.trim())) continue;

    // Check against known agent patterns
    if (KNOWN_AGENT_PATTERNS.some((p) => p.test(sender))) {
      agents.add(sender);
      continue;
    }

    // If sender name is short (first name only) and different from patient, likely agent
    const senderParts = sender.trim().split(/\s+/);
    const patientParts = patientName.trim().split(/\s+/);

    // Check if sender's first name appears in patient name
    const senderFirst = senderParts[0]?.toLowerCase() ?? "";
    const patientFirst = patientParts[0]?.toLowerCase() ?? "";
    if (senderFirst === patientFirst) continue;

    // If patient name doesn't contain sender at all, it could be an agent
    // Heuristic: short single-word names that don't match patient = likely agent
    if (senderParts.length <= 2 && !patientNameLower.includes(senderFirst)) {
      // Additional check: does this look like a numbered ID sender?
      if (/^\d+\s*-\s*/i.test(sender)) continue; // IDs like "1042740 - EMANUEL" are patients

      agents.add(sender);
    }
  }

  return [...agents];
}

function isAgentSender(sender: string, patientName: string, agentNames: string[]): boolean {
  // Direct match with detected agents
  if (agentNames.includes(sender)) return true;

  // Known agent patterns
  if (KNOWN_AGENT_PATTERNS.some((p) => p.test(sender))) return true;

  // Is it the patient? Then NOT an agent
  const senderLower = sender.toLowerCase().trim();
  const patientLower = patientName.toLowerCase().trim();

  if (senderLower === patientLower) return false;
  if (patientLower.includes(senderLower) || senderLower.includes(patientLower)) return false;

  // Phone numbers are usually patients
  if (PHONE_NUMBER_PATTERN.test(sender.trim())) return false;

  // Numbered IDs are patients
  if (/^\d+\s*-\s*/i.test(sender)) return false;

  // Default: if not the patient, assume agent
  return true;
}

function parseEsteworldDate(raw: string): string {
  // "13.05.2025 15:47" → ISO 8601
  const match = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/.exec(raw);
  if (!match) return "";
  const [, day, month, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00.000Z`;
}

function stripQuotes(text: string): string {
  let t = text;
  // Remove surrounding CSV quotes
  if (t.startsWith('"') && t.endsWith('"')) {
    t = t.slice(1, -1);
  } else if (t.startsWith('"')) {
    t = t.slice(1);
  } else if (t.endsWith('"')) {
    t = t.slice(0, -1);
  }
  // Unescape doubled quotes
  t = t.replace(/""/g, '"');
  return t;
}
