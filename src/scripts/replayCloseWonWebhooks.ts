import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import readline from "node:readline";
import { logger } from "../shared/logger.js";

const DEFAULT_BASE = "http://localhost:3000";
const DEFAULT_DELAY_MS = 300;

async function postWebhook(baseUrl: string, body: unknown): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/webhook/wazzup`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook POST failed ${response.status}: ${text}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function replayFromNdjsonPath(
  filePath: string,
  baseUrl: string,
  delayMs: number,
  fixedMessageId: string | undefined
): Promise<void> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNo = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    lineNo += 1;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON on line ${lineNo}`);
    }

    if (fixedMessageId) {
      payload.message_id = fixedMessageId;
    }

    await postWebhook(baseUrl, payload);
    logger.info({ lineNo, messageId: payload.message_id }, "Replayed webhook");

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  if (lineNo === 0) {
    throw new Error("NDJSON file is empty.");
  }

  logger.info({ filePath, lines: lineNo, fixedMessageId: fixedMessageId ?? null }, "Replay complete");
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: tsx src/scripts/replayCloseWonWebhooks.ts <path.ndjson>");
  }

  const baseUrl = process.env.CHAT_WEBHOOK_BASE ?? DEFAULT_BASE;
  const delayRaw = process.env.CHAT_WEBHOOK_REPLAY_DELAY_MS;
  const delayMs = delayRaw ? Number(delayRaw) : DEFAULT_DELAY_MS;
  if (Number.isNaN(delayMs) || delayMs < 0) {
    throw new Error("CHAT_WEBHOOK_REPLAY_DELAY_MS must be a non-negative number.");
  }

  const fixedMessageId = process.env.CHAT_WEBHOOK_FIXED_MESSAGE_ID?.trim() || undefined;

  await readFile(filePath);
  await replayFromNdjsonPath(filePath, baseUrl, delayMs, fixedMessageId);
}

main().catch((error) => {
  logger.error({ err: error }, "replayCloseWonWebhooks failed");
  process.exit(1);
});
