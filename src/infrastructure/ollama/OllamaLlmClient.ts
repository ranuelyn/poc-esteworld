import { z } from "zod";
import { buildSalesAssistantMessages } from "../../application/prompts/salesAssistantPrompt.js";
import type { LeadAssessmentDraft, LeadAssessmentInput, LlmPort } from "../../domain/ports/LlmPort.js";
import { env } from "../../config/env.js";

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
    .min(3),
  salesBoosts: z
    .array(
      z.object({
        type: z.enum([
          "shorter",
          "more_trustworthy",
          "more_persuasive",
          "ask_for_photos",
          "ask_travel_dates",
          "ask_for_deposit",
          "confirm_flights",
          "make_softer"
        ]),
        label: z.string().min(1),
        promptHint: z.string().min(1)
      })
    )
    .min(1),
  silencePlan: z
    .array(
      z.object({
        day: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14)]),
        action: z.string().min(1)
      })
    )
    .length(4),
  funnelStage: z.object({
    stage: z.coerce.number().int().min(1).max(11).default(1),
    label: z.string().min(1).default("Lead"),
    nextMilestone: z.string().min(1).default("Identify treatment interest"),
  }).optional(),
  followUpQuestions: z.array(z.string()).max(3).default([]),
  riskFlags: z.array(z.string()).default([])
});

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  response?: string;
}

export class OllamaLlmClient implements LlmPort {
  constructor(
    private readonly baseUrl = env.OLLAMA_BASE_URL,
    private readonly model = env.OLLAMA_LLM_MODEL,
    private readonly timeoutMs = env.OLLAMA_REQUEST_TIMEOUT_MS
  ) {}

  async generateLeadAssessment(input: LeadAssessmentInput): Promise<LeadAssessmentDraft> {
    const messages = buildSalesAssistantMessages(input.message, input.retrievedDialogues);
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: "json",
        options: {
          temperature: 0.2,
          top_p: 0.8,
          num_ctx: env.OLLAMA_NUM_CTX
        }
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Ollama chat request failed with status ${response.status}.`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    const content = body.message?.content ?? body.response;
    if (!content) {
      throw new Error("Ollama returned an empty response.");
    }

    const rawDraft = JSON.parse(extractJsonObject(content));
    return leadAssessmentDraftSchema.parse(normalizeLeadAssessmentDraft(rawDraft));
  }
}

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

const defaultReplyStyles = ["professional", "warm_trust", "closing_focused"] as const;

function normalizeLeadAssessmentDraft(rawDraft: unknown): unknown {
  if (!isRecord(rawDraft)) {
    return rawDraft;
  }

  const draft = { ...rawDraft };
  draft.analysis = normalizeAnalysis(draft.analysis);
  draft.nextBestAction = normalizeNextBestAction(draft.nextBestAction);
  draft.suggestedReplies = normalizeSuggestedReplies(draft.suggestedReplies);
  draft.salesBoosts = normalizeSalesBoosts(draft.salesBoosts);
  draft.silencePlan = normalizeSilencePlan(draft.silencePlan);
  draft.funnelStage = normalizeFunnelStage(draft.funnelStage);
  draft.followUpQuestions = Array.isArray(draft.followUpQuestions) ? draft.followUpQuestions : [];
  draft.riskFlags = Array.isArray(draft.riskFlags) ? draft.riskFlags : [];
  applyRiskCorrections(draft);

  return draft;
}

function normalizeAnalysis(value: unknown) {
  const analysis = isRecord(value) ? value : {};
  const leadScore = toBoundedInteger(analysis.leadScore, 0, 100, 50);

  return {
    language: toNonEmptyString(analysis.language, "English (UK)"),
    treatment: toNonEmptyString(analysis.treatment, "Unknown"),
    intent: toNonEmptyString(analysis.intent, "Needs follow-up"),
    leadTemperature: normalizeLeadTemperature(analysis.leadTemperature, leadScore),
    leadScore,
    confidence: toBoundedInteger(analysis.confidence, 0, 100, 70),
    signals: Array.isArray(analysis.signals) ? analysis.signals.map(String) : []
  };
}

function normalizeNextBestAction(value: unknown) {
  const nextBestAction = isRecord(value) ? value : {};

  return {
    title: toNonEmptyString(nextBestAction.title, "Follow up professionally"),
    rationale: toNonEmptyString(
      nextBestAction.rationale,
      "Use a safe, clear, and trust-building reply based on the latest conversation."
    ),
    evidence: normalizeStringOrArray(nextBestAction.evidence, "Derived from the conversation context.")
  };
}

function normalizeSuggestedReplies(value: unknown) {
  const rawReplies = Array.isArray(value) ? value : [];
  const normalizedReplies = rawReplies
    .filter(isRecord)
    .slice(0, 3)
    .map((reply, index) => {
      const style = normalizeReplyStyle(
        toNonEmptyString(reply.style, toNonEmptyString(reply.id, getDefaultReplyStyle(index)))
      ) as (typeof defaultReplyStyles)[number];

      return {
        id: toNonEmptyString(reply.id, style),
        style,
        label: toNonEmptyString(reply.label, labelForReplyStyle(style)),
        text: toNonEmptyString(reply.text, fallbackReplyText(style)),
        isRecommended: typeof reply.isRecommended === "boolean" ? reply.isRecommended : style === "closing_focused"
      };
    });
  const replies = dedupeRepliesByStyle(normalizedReplies);

  for (let index = replies.length; index < 3; index += 1) {
    const style = getDefaultReplyStyle(index);
    replies.push({
      id: style,
      style,
      label: labelForReplyStyle(style),
      text: fallbackReplyText(style),
      isRecommended: style === "closing_focused"
    });
  }

  if (!replies.some((reply) => reply.isRecommended)) {
    const lastReply = replies.at(-1);
    if (lastReply) {
      lastReply.isRecommended = true;
    }
  }

  const recommendedReply = replies.find((reply) => reply.isRecommended);
  for (const reply of replies) {
    reply.isRecommended = reply === recommendedReply;
  }

  return replies;
}

function normalizeSalesBoosts(value: unknown) {
  const rawBoosts = Array.isArray(value) ? value : [];
  const boosts = rawBoosts.filter(isRecord).map((boost, index) => {
    const fallback = defaultSalesBoosts[index] ?? defaultSalesBoosts[0];
    const type = normalizeBoostType(toNonEmptyString(boost.type, fallback.type));

    return {
      type,
      label: toNonEmptyString(boost.label, labelForBoostType(type)),
      promptHint: toNonEmptyString(boost.promptHint, promptHintForBoostType(type))
    };
  });

  return boosts.length > 0 ? boosts : [...defaultSalesBoosts];
}

function normalizeFunnelStage(value: unknown) {
  const funnelStage = isRecord(value) ? value : {};

  return {
    stage: toBoundedInteger(funnelStage.stage, 1, 11, 1),
    label: toNonEmptyString(funnelStage.label, "Lead"),
    nextMilestone: toNonEmptyString(funnelStage.nextMilestone, "Identify treatment interest")
  };
}

function normalizeSilencePlan(value: unknown) {
  const rawSteps = Array.isArray(value) ? value : [];
  const steps = rawSteps.filter(isRecord).slice(0, 4).map((step, index) => {
    const fallback = getDefaultSilenceStep(index);
    return {
      day: normalizeSilenceDay(step.day, fallback.day),
      action: toNonEmptyString(step.action, fallback.action)
    };
  });

  for (let index = steps.length; index < 4; index += 1) {
    steps.push(getDefaultSilenceStep(index));
  }

  return steps;
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Ollama response did not contain a JSON object.");
  }

  return trimmed.slice(start, end + 1);
}

function normalizeReplyStyle(style: string): string {
  const normalized = style.toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("warm") || normalized.includes("trust")) {
    return "warm_trust";
  }
  if (normalized.includes("closing") || normalized.includes("close")) {
    return "closing_focused";
  }

  return "professional";
}

function dedupeRepliesByStyle(
  replies: Array<{
    id: string;
    style: "professional" | "warm_trust" | "closing_focused";
    label: string;
    text: string;
    isRecommended: boolean;
  }>
) {
  const byStyle = new Map<(typeof defaultReplyStyles)[number], (typeof replies)[number]>();
  for (const reply of replies) {
    if (!byStyle.has(reply.style)) {
      byStyle.set(reply.style, {
        ...reply,
        id: reply.style,
        label: labelForReplyStyle(reply.style)
      });
    }
  }

  return defaultReplyStyles
    .map((style) => byStyle.get(style))
    .filter((reply): reply is (typeof replies)[number] => Boolean(reply));
}

function applyRiskCorrections(draft: Record<string, unknown>) {
  const analysis = draft.analysis;
  const riskFlags = Array.isArray(draft.riskFlags) ? draft.riskFlags.map(String) : [];
  const signals = isRecord(analysis) && Array.isArray(analysis.signals) ? analysis.signals.map(String) : [];
  const allRiskText = [...riskFlags, ...signals, JSON.stringify(draft.nextBestAction ?? {})].join(" ").toLowerCase();
  const hasLegalOrTrustCollapse =
    allRiskText.includes("sue") ||
    allRiskText.includes("legal") ||
    allRiskText.includes("rude") ||
    allRiskText.includes("angry") ||
    allRiskText.includes("trust collapse") ||
    allRiskText.includes("agent conduct");

  if (!isRecord(analysis)) {
    return;
  }

  const currentScore = toBoundedInteger(analysis.leadScore, 0, 100, 50);
  if (hasLegalOrTrustCollapse) {
    analysis.leadScore = Math.min(currentScore, 20);
    analysis.leadTemperature = "cold";
    if (!riskFlags.includes("agent conduct risk")) {
      riskFlags.push("agent conduct risk");
    }
    if (!riskFlags.includes("legal escalation risk")) {
      riskFlags.push("legal escalation risk");
    }
    draft.nextBestAction = {
      title: "De-escalate and escalate internally",
      rationale:
        "The lead shows trust collapse or legal escalation risk. The representative should apologise, stop selling, and escalate to a manager or patient relations team.",
      evidence: "Conversation contains legal threat, anger, or agent conduct risk."
    };
    draft.suggestedReplies = [
      {
        id: "professional",
        style: "professional",
        label: "Professional",
        text: "You are right to raise this. I apologise for the way this conversation has made you feel. I will escalate this internally so a senior team member can review and respond properly.",
        isRecommended: true
      },
      {
        id: "warm_trust",
        style: "warm_trust",
        label: "Warm & Trust-building",
        text: "I am sorry for the frustration caused. Your concern deserves a careful response, not pressure. I can have our patient relations team follow up with clear information and next steps.",
        isRecommended: false
      },
      {
        id: "closing_focused",
        style: "closing_focused",
        label: "Closing-focused",
        text: "Before discussing any treatment plan, I should first help resolve your concern. I will pause the sales conversation and escalate this for proper review.",
        isRecommended: false
      }
    ];
  } else {
    analysis.leadTemperature = normalizeLeadTemperature(analysis.leadTemperature, currentScore);
  }

  draft.riskFlags = riskFlags;
}

function getDefaultReplyStyle(index: number): (typeof defaultReplyStyles)[number] {
  return defaultReplyStyles[index] ?? "professional";
}

function getDefaultSilenceStep(index: number): (typeof defaultSilencePlan)[number] {
  return defaultSilencePlan[index] ?? defaultSilencePlan[0]!;
}

function normalizeBoostType(boostType: string): (typeof defaultSalesBoosts)[number]["type"] {
  const normalized = boostType.toLowerCase().replace(/[\s-]+/g, "_");
  const match = defaultSalesBoosts.find((boost) => boost.type === normalized);
  return match?.type ?? "more_trustworthy";
}

function normalizeLeadTemperature(value: unknown, leadScore: number): "cold" | "warm" | "hot" {
  if (value === "cold" || value === "warm" || value === "hot") {
    return value;
  }

  if (leadScore >= 70) {
    return "hot";
  }
  if (leadScore >= 40) {
    return "warm";
  }
  return "cold";
}

function normalizeSilenceDay(value: unknown, fallback: 1 | 3 | 7 | 14): 1 | 3 | 7 | 14 {
  if (value === 1 || value === 3 || value === 7 || value === 14) {
    return value;
  }

  const numericValue = Number(value);
  if (numericValue === 1 || numericValue === 3 || numericValue === 7 || numericValue === 14) {
    return numericValue;
  }

  return fallback;
}

function labelForReplyStyle(style: "professional" | "warm_trust" | "closing_focused"): string {
  switch (style) {
    case "warm_trust":
      return "Warm & Trust-building";
    case "closing_focused":
      return "Closing-focused";
    case "professional":
      return "Professional";
  }
}

function labelForBoostType(boostType: (typeof defaultSalesBoosts)[number]["type"]): string {
  return defaultSalesBoosts.find((boost) => boost.type === boostType)?.label ?? "Improve reply";
}

function promptHintForBoostType(boostType: (typeof defaultSalesBoosts)[number]["type"]): string {
  return defaultSalesBoosts.find((boost) => boost.type === boostType)?.promptHint ?? "Improve the reply";
}

function fallbackReplyText(style: "professional" | "warm_trust" | "closing_focused"): string {
  switch (style) {
    case "warm_trust":
      return "I completely understand your concern. Let me clarify this safely and make sure our doctor reviews the details before we move forward.";
    case "closing_focused":
      return "Based on your details, the next best step is to confirm the review items and then I can help you secure the most suitable date.";
    case "professional":
      return "Thank you for the update. I will review the details and guide you through the safest next step.";
  }
}

function normalizeStringOrArray(value: unknown, fallback: string): string {
  if (Array.isArray(value)) {
    const joined = value.map(String).filter(Boolean).join(" ");
    return joined || fallback;
  }

  return toNonEmptyString(value, fallback);
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toBoundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
