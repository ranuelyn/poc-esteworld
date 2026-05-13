/**
 * Gemini implementation of LlmPort — allows running the AI copilot
 * entirely via Gemini API without requiring local Ollama.
 */

import { z } from "zod";
import { buildSalesAssistantMessages } from "../../application/prompts/salesAssistantPrompt.js";
import type { LeadAssessmentDraft, LeadAssessmentInput, LlmPort } from "../../domain/ports/LlmPort.js";
import { env } from "../../config/env.js";

const funnelStageSchema = z.object({
  stage: z.coerce.number().int().min(1).max(11).default(1),
  label: z.string().min(1).default("Lead"),
  nextMilestone: z.string().min(1).default("Identify treatment interest"),
}).optional();

const leadAssessmentDraftSchema = z.object({
  analysis: z.object({
    language: z.string().min(1),
    treatment: z.string().min(1),
    intent: z.string().min(1),
    leadTemperature: z.enum(["cold", "warm", "hot"]),
    leadScore: z.number().int().min(0).max(100),
    confidence: z.number().int().min(0).max(100),
    signals: z.array(z.string()).default([])
  }),
  funnelStage: funnelStageSchema,
  nextBestAction: z.object({
    title: z.string().min(1),
    rationale: z.string().min(1),
    evidence: z.string().min(1)
  }),
  suggestedReplies: z
    .array(
      z.object({
        id: z.string().min(1),
        style: z.preprocess(
          (value) => (typeof value === "string" ? normalizeReplyStyle(value) : value),
          z.enum(["professional", "warm_trust", "closing_focused"])
        ),
        label: z.string().min(1).optional(),
        text: z.string().min(1),
        isRecommended: z.boolean().default(false)
      }).transform((reply) => ({
        ...reply,
        label: reply.label ?? labelForReplyStyle(reply.style)
      }))
    )
    .min(1),
  salesBoosts: z
    .array(
      z.object({
        type: z.enum([
          "shorter", "more_trustworthy", "more_persuasive",
          "ask_for_photos", "ask_travel_dates", "ask_for_deposit",
          "confirm_flights", "make_softer"
        ]),
        label: z.string().min(1),
        promptHint: z.string().min(1)
      })
    )
    .default([]),
  silencePlan: z
    .array(
      z.object({
        day: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14)]),
        action: z.string().min(1)
      })
    )
    .default([]),
  followUpQuestions: z.array(z.string()).max(3).default([]),
  riskFlags: z.array(z.string()).default([])
});

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export class GeminiLlmClient implements LlmPort {
  constructor(
    private readonly apiKey = env.GEMINI_API_KEY,
    private readonly model = env.GEMINI_MODEL,
    private readonly maxAttempts = env.GEMINI_RETRY_MAX_ATTEMPTS,
    private readonly baseDelayMs = env.GEMINI_RETRY_BASE_DELAY_MS
  ) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is required when using Gemini as LLM provider.");
    }
  }

  async generateLeadAssessment(input: LeadAssessmentInput): Promise<LeadAssessmentDraft> {
    const messages = buildSalesAssistantMessages(input.message, input.retrievedDialogues);

    const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
    const userContent = messages.find((m) => m.role === "user")?.content ?? "";

    const rawDraft = await this.generateJson(
      `${systemContent}\n\n---\n\n${userContent}`,
      0.25
    );

    const normalized = normalizeLeadAssessmentDraft(rawDraft);
    return leadAssessmentDraftSchema.parse(normalized);
  }

  private async generateJson(prompt: string, temperature: number): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }]
                }
              ],
              generationConfig: {
                temperature,
                topP: 0.85,
                responseMimeType: "application/json"
              }
            })
          }
        );

        if (!response.ok) {
          const body = await response.text();
          const error = new Error(`Gemini LLM request failed with status ${response.status}: ${body}`);
          if (!isRetryableStatus(response.status) || attempt === this.maxAttempts) {
            throw error;
          }
          lastError = error;
          await sleep(backoffDelay(this.baseDelayMs, attempt));
          continue;
        }

        const body = (await response.json()) as GeminiResponse;
        const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
          throw new Error("Gemini LLM returned an empty response.");
        }

        return JSON.parse(extractJsonObject(content));
      } catch (error) {
        const resolved = error instanceof Error ? error : new Error("Unknown Gemini LLM error.");
        if (attempt === this.maxAttempts) {
          throw resolved;
        }
        lastError = resolved;
        await sleep(backoffDelay(this.baseDelayMs, attempt));
      }
    }

    throw lastError ?? new Error("Gemini LLM request failed after retries.");
  }
}

// --- Normalisation helpers ---

const defaultSalesBoosts = [
  { type: "shorter", label: "Shorter", promptHint: "Make the reply shorter" },
  { type: "more_trustworthy", label: "More trustworthy", promptHint: "Increase trust" },
  { type: "more_persuasive", label: "More persuasive", promptHint: "Increase persuasion" },
  { type: "ask_for_photos", label: "Ask for photos", promptHint: "Ask for photos" },
  { type: "ask_travel_dates", label: "Ask travel dates", promptHint: "Ask for travel dates" },
  { type: "ask_for_deposit", label: "Ask for deposit", promptHint: "Softly ask for reservation or deposit" },
  { type: "confirm_flights", label: "Confirm flights", promptHint: "Confirm flight details" },
  { type: "make_softer", label: "Make softer", promptHint: "Use a softer tone" }
] as const;

const defaultSilencePlan = [
  { day: 1, action: "Send a gentle check-in and ask if they need anything clarified." },
  { day: 3, action: "Share a value-focused follow-up with clinical review and package details." },
  { day: 7, action: "Use soft urgency around date availability without pressure." },
  { day: 14, action: "Re-engage with a patient result story and offer a fresh consultation." }
] as const;

function normalizeLeadAssessmentDraft(rawDraft: unknown): unknown {
  if (!isRecord(rawDraft)) return rawDraft;

  const draft = { ...rawDraft };
  if (!Array.isArray(draft.salesBoosts) || draft.salesBoosts.length === 0) {
    draft.salesBoosts = [...defaultSalesBoosts];
  }
  if (!Array.isArray(draft.silencePlan) || draft.silencePlan.length < 4) {
    draft.silencePlan = [...defaultSilencePlan];
  }
  if (!Array.isArray(draft.followUpQuestions)) {
    draft.followUpQuestions = [];
  }
  if (!Array.isArray(draft.riskFlags)) {
    draft.riskFlags = [];
  }

  // Ensure 3 suggested replies
  if (Array.isArray(draft.suggestedReplies)) {
    const replies = draft.suggestedReplies.filter(isRecord);
    if (replies.length < 3) {
      const styles = ["professional", "warm_trust", "closing_focused"];
      for (let i = replies.length; i < 3; i++) {
        replies.push({
          id: styles[i],
          style: styles[i],
          label: labelForReplyStyle(styles[i]!),
          text: "I'll review the details and get back to you with the best options.",
          isRecommended: i === 2
        });
      }
      draft.suggestedReplies = replies;
    }
  }

  return draft;
}

function normalizeReplyStyle(style: string): string {
  const normalized = style.toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("warm") || normalized.includes("trust")) return "warm_trust";
  if (normalized.includes("closing") || normalized.includes("close")) return "closing_focused";
  return "professional";
}

function labelForReplyStyle(style: string): string {
  switch (style) {
    case "warm_trust": return "Warm & Trust-building";
    case "closing_focused": return "Closing-focused";
    default: return "Professional";
  }
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini LLM response did not contain a JSON object.");
  }
  return trimmed.slice(start, end + 1);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function backoffDelay(baseDelayMs: number, attempt: number): number {
  const cappedAttempt = Math.min(attempt, 6);
  const exponential = baseDelayMs * 2 ** (cappedAttempt - 1);
  const jitter = Math.floor(Math.random() * Math.floor(baseDelayMs / 2));
  return exponential + jitter;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
