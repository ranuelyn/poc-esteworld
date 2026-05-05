import { readFile } from "node:fs/promises";
import AdmZip from "adm-zip";

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function normalizeTranscriptLineBreaks(plain: string): string {
  let t = plain.replace(/\r\n/g, "\n");
  t = t.replace(/(?<!\n)\s*(Representative:)/gi, "\n$1");
  t = t.replace(/(?<!\n)\s*(Patient:)/gi, "\n$1");
  t = t.replace(/(?<!\n)\s*(Phone:)/gi, "\n$1");
  t = t.replace(/(?<!\n)(?=Patient\s+\d+\.)/gi, "\n");
  t = t.replace(/(?<!\n)(?=Patient\s+\d+\s+(?!years\b))/gi, "\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function extractParagraphsFromDocxBuffer(buffer: Buffer): string[] {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) {
    throw new Error("DOCX missing word/document.xml (not a valid Word document?).");
  }

  const xml = entry.getData().toString("utf8");
  return paragraphsFromDocumentXml(xml);
}

/**
 * Pull plain text from OOXML `word/document.xml` in document order.
 */
export function extractPlainTextFromDocxBuffer(buffer: Buffer): string {
  const raw = extractParagraphsFromDocxBuffer(buffer).join("\n");
  return normalizeTranscriptLineBreaks(raw);
}

export async function readDocxParagraphs(inputPath: string): Promise<string[]> {
  const buffer = await readFile(inputPath);
  return extractParagraphsFromDocxBuffer(buffer);
}

function paragraphsFromDocumentXml(xml: string): string[] {
  const paragraphs: string[] = [];
  const paraRegex = /<w:p\b[\s\S]*?<\/w:p>/g;
  let paraMatch: RegExpExecArray | null;

  while ((paraMatch = paraRegex.exec(xml)) !== null) {
    const para = paraMatch[0];
    const pieces: string[] = [];
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = tRe.exec(para)) !== null) {
      pieces.push(decodeXmlEntities(m[1] ?? ""));
    }
    const line = pieces.join("").replace(/\s+/g, " ").trim();
    if (line) {
      paragraphs.push(line);
    }
  }

  return paragraphs;
}

export async function readDocxPlainText(inputPath: string): Promise<string> {
  const buffer = await readFile(inputPath);
  return extractPlainTextFromDocxBuffer(buffer);
}
