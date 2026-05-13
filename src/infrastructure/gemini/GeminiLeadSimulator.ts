import { z } from "zod";
import { env } from "../../config/env.js";
import type { CopilotCase } from "../mock/InMemoryLeadSink.js";

export const testScenarios = [
  {
    id: "hot_dhi_booking",
    title: "Hot lead - ready to book",
    personality: "confident_closer",
    personalityLabel: "Confident Closer",
    patientName: "Isabel M.",
    language: "English (UK)",
    treatment: "DHI Hair Transplant",
    seedOpening:
      "I have annual leave in two weeks and want to book DHI quickly. Can you support travel and hotel logistics?",
    persona:
      "High-intent buyer, confident, wants logistics, payment, dates, and fast booking. Be cooperative if the agent is helpful.",
    maxTurns: 4
  },
  {
    id: "price_sensitive_fue",
    title: "Price sensitive - needs value",
    personality: "bargain_hunter",
    personalityLabel: "Bargain Hunter",
    patientName: "Ahmed K.",
    language: "English (UK)",
    treatment: "FUE Hair Transplant",
    seedOpening: "I am mostly comparing prices across clinics. Why should I pay more?",
    persona:
      "Price-sensitive and hesitant. Compare with cheaper Istanbul clinics. Become warmer if the agent explains value, safety, hotel, and aftercare without pressure.",
    maxTurns: 5
  },
  {
    id: "toxicity_edge_case",
    title: "Sceptical lead - social proof objection",
    personality: "aggressive_skeptic",
    personalityLabel: "Aggressive Skeptic",
    patientName: "Mert OE",
    language: "English (UK)",
    treatment: "Rhinoplasty",
    seedOpening: "I saw negative Reddit posts about your clinic. Convince me this is not a scam.",
    persona:
      "Sceptical and trust-sensitive. If the agent is dismissive or rude, escalate anger and mention complaints/legal concern. If the agent apologises and de-escalates, slowly calm down.",
    maxTurns: 4
  },
  {
    id: "medical_anxiety_implants",
    title: "Medical anxiety - trust focused",
    personality: "anxious_patient",
    personalityLabel: "Anxious Patient",
    patientName: "Fatima A.",
    language: "English (UK)",
    treatment: "Dental Implants",
    seedOpening: "I need implants but I am scared of procedures and I have diabetes. Is this safe?",
    persona:
      "Anxious patient with medical safety concerns. Needs reassurance, clinical protocol, HbA1c, sedation information, and no exaggerated guarantees.",
    maxTurns: 5
  },
  {
    id: "vip_fast_lane",
    title: "VIP urgency - premium expectations",
    personality: "demanding_vip",
    personalityLabel: "Demanding VIP",
    patientName: "Luca B.",
    language: "English (UK)",
    treatment: "Hollywood Smile",
    seedOpening: "I only have 3 days in Istanbul. Can you guarantee an accelerated premium plan?",
    persona:
      "Busy, demanding, asks for premium handling, speed, and certainty. Gets impatient with vague answers.",
    maxTurns: 4
  },
  {
    id: "silent_then_returns",
    title: "Ghosting lead - comes back later",
    personality: "silent_observer",
    personalityLabel: "Silent Observer",
    patientName: "Nora H.",
    language: "English (UK)",
    treatment: "Breast Augmentation",
    seedOpening: "I am interested but not sure. Just checking options for now.",
    persona:
      "Responds briefly and disappears. Returns only when follow-up is gentle, structured, and low-pressure.",
    maxTurns: 6
  },
  {
    id: "legal_risk_patient",
    title: "Legal-risk lead - consent sensitive",
    personality: "legal_guarded",
    personalityLabel: "Legal Guarded",
    patientName: "Daniel S.",
    language: "English (UK)",
    treatment: "Hair Transplant Repair",
    seedOpening: "Before we talk, I need proof of medical responsibility if something goes wrong.",
    persona:
      "Legally sensitive and risk-focused. Asks about consent, liabilities, guarantees, and escalation channels.",
    maxTurns: 5
  },
  {
    id: "family_decision_maker",
    title: "Family committee - multi-approval",
    personality: "collective_decider",
    personalityLabel: "Collective Decider",
    patientName: "Aisha R.",
    language: "English (UK)",
    treatment: "Mommy Makeover",
    seedOpening: "My husband and sister must also approve. Can you send a clear plan for all of us?",
    persona:
      "Needs shareable clarity. Decisions are collective. Values transparency, milestones, and predictable costs.",
    maxTurns: 5
  },
  {
    id: "social_media_influenced",
    title: "Influencer-inspired expectations",
    personality: "trend_driven",
    personalityLabel: "Trend Driven",
    patientName: "Maya T.",
    language: "English (UK)",
    treatment: "Fox Eye + Rhinoplasty",
    seedOpening: "I want the exact result I saw from an influencer. Can your doctors replicate it exactly?",
    persona:
      "Visual and trend-driven. Pushes for perfect replication. Needs expectation management and medical realism.",
    maxTurns: 5
  },
  {
    id: "budget_crisis_last_minute",
    title: "Last-minute budget collapse",
    personality: "stressed_buyer",
    personalityLabel: "Stressed Buyer",
    patientName: "Omar J.",
    language: "English (UK)",
    treatment: "Sleeve Gastrectomy",
    seedOpening: "I was ready but my budget changed this week. Is there any safe plan still possible?",
    persona:
      "Financially stressed but still interested. Needs alternatives, phased planning, and no manipulative pressure.",
    maxTurns: 5
  },
  {
    id: "aggressive_negotiator",
    title: "Aggressive negotiator - hard pressure",
    personality: "aggressive_negotiator",
    personalityLabel: "Aggressive Negotiator",
    patientName: "Victor K.",
    language: "English (UK)",
    treatment: "Beard Transplant",
    seedOpening: "Give me your lowest final price now or I move to another clinic in 5 minutes.",
    persona:
      "Confrontational and dominant in negotiation. Tests boundaries. Can soften if treated calmly and professionally.",
    maxTurns: 5
  },
  {
    id: "warm_turkish_lead",
    title: "Turkish-speaking warm lead",
    personality: "warm_local",
    personalityLabel: "Warm Local",
    patientName: "Ece Y.",
    language: "Turkish",
    treatment: "Saç Ekimi (FUE/Sapphire)",
    seedOpening: "Merhaba, Esteworld hakkında araştırma yapıyorum. FUE ve Sapphire arasındaki fark nedir? Fiyat bilgisi alabilir miyim?",
    persona:
      "Warm and polite Turkish lead. Familiar with hair transplant basics. Becomes quickly engaged when process is clearly explained in Turkish. Values Esteworld London office for follow-up.",
    maxTurns: 4
  },
  {
    id: "esteworld_bride_makeover",
    title: "Bride-to-be considering multiple procedures",
    personality: "indecisive_buyer",
    personalityLabel: "Indecisive Buyer",
    patientName: "Dai'za D.",
    language: "English (UK)",
    treatment: "Breast Uplift + Tummy Tuck",
    seedOpening: "Hi, I'm getting married next July and I'm thinking about breast uplift now and maybe tummy area after the wedding. My partner needs to approve the finances though. What packages do you have?",
    persona:
      "Bride planning multiple procedures across different timelines. Partner must approve finances. Needs clear phasing options, transparent pricing, and reassurance about recovery before wedding. Based on real Esteworld patient pattern.",
    maxTurns: 5
  },
  {
    id: "esteworld_veneer_shopper",
    title: "UK patient comparing veneer prices",
    personality: "price_conscious",
    personalityLabel: "Price Conscious",
    patientName: "Lee R.",
    language: "English (UK)",
    treatment: "Dental Veneers (16 teeth)",
    seedOpening: "I need 16 veneers. I got a quote from another clinic in Antalya for £4,200. What can Esteworld offer? I want zirconium.",
    persona:
      "Price-focused UK patient actively comparing Turkish dental clinics. Has specific material preference (zirconium). Needs to be moved from price comparison to clinical review and trust-building. Responds well to before/after photos and London office support mention.",
    maxTurns: 5
  }
] as const;

export type TestScenario = (typeof testScenarios)[number];

const geminiResponseSchema = z.object({
  message: z.string().min(1),
  shouldEnd: z.boolean().default(false),
  mood: z.string().default("neutral")
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

export class GeminiLeadSimulator {
  constructor(
    private readonly apiKey = env.GEMINI_API_KEY,
    private readonly model = env.GEMINI_MODEL,
    private readonly maxAttempts = env.GEMINI_RETRY_MAX_ATTEMPTS,
    private readonly baseDelayMs = env.GEMINI_RETRY_BASE_DELAY_MS
  ) {}

  async generateLeadReply(caseItem: CopilotCase) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is missing.");
    }

    const scenario = getScenario(caseItem.message.rawPayload);
    const payload = await this.generateJson(buildLeadSimulationPrompt(caseItem, scenario), 0.85);
    return geminiResponseSchema.parse(payload);
  }

  async generateOpeningMessage(scenarioId: string) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is missing.");
    }
    const scenario = getScenarioById(scenarioId);
    const payload = await this.generateJson(buildOpeningPrompt(scenario), 0.95);
    return geminiResponseSchema.parse(payload);
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
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature,
                topP: 0.9,
                responseMimeType: "application/json"
              }
            })
          }
        );

        if (!response.ok) {
          const body = await response.text();
          const error = new Error(`Gemini request failed with status ${response.status}: ${body}`);
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
          throw new Error("Gemini returned an empty response.");
        }

        return JSON.parse(extractJsonObject(content));
      } catch (error) {
        const resolvedError = error instanceof Error ? error : new Error("Unknown Gemini error.");
        if (attempt === this.maxAttempts) {
          throw resolvedError;
        }
        lastError = resolvedError;
        await sleep(backoffDelay(this.baseDelayMs, attempt));
      }
    }

    throw lastError ?? new Error("Gemini request failed after retries.");
  }
}

export function getScenario(rawPayload: unknown) {
  const scenarioId =
    typeof rawPayload === "object" && rawPayload !== null && "scenario_id" in rawPayload
      ? String((rawPayload as { scenario_id?: unknown }).scenario_id)
      : undefined;

  return getScenarioById(scenarioId);
}

export function getScenarioById(scenarioId?: string): TestScenario {
  return testScenarios.find((scenario) => scenario.id === scenarioId) ?? testScenarios[0];
}

function buildLeadSimulationPrompt(caseItem: CopilotCase, scenario: TestScenario) {
  const transcript = caseItem.conversation
    .map((message) => `${message.role === "agent" ? "Sales representative" : "Lead"}: ${message.text}`)
    .join("\n");
  const assessment = caseItem.assessment;
  const recommendedReply = assessment?.suggestedReplies.find((reply) => reply.isRecommended);

  return `You are simulating the LEAD in a healthcare tourism sales demo.
Stay in character. Do not write as the sales representative.

Scenario: ${scenario.title}
Persona: ${scenario.persona}
Personality style: ${scenario.personalityLabel} (${scenario.personality})
Patient language: ${scenario.language}
Treatment: ${scenario.treatment}
Max turns: ${scenario.maxTurns}

Current AI copilot assessment:
- lead temperature: ${assessment?.analysis.leadTemperature ?? "unknown"}
- lead score: ${assessment?.analysis.leadScore ?? "unknown"}
- intent: ${assessment?.analysis.intent ?? "unknown"}
- risk flags: ${(assessment?.riskFlags ?? []).join(", ") || "none"}
- recommended sales reply: ${recommendedReply?.text ?? "none"}
- next best action: ${assessment?.nextBestAction.title ?? "none"}

Conversation so far:
${transcript}

Generate the next lead message after the latest sales representative action.
If the sales representative is helpful, move naturally toward the scenario goal.
If the sales representative is unsafe, rude, dismissive, or overpromising, react negatively.
If the scenario has reached a natural conclusion, set shouldEnd=true.

Return only JSON:
{
  "message": "the lead's next message",
  "shouldEnd": boolean,
  "mood": "short mood label"
}`;
}

function buildOpeningPrompt(scenario: TestScenario): string {
  return `You are creating the FIRST message for a lead in a healthcare tourism sales simulation.
Stay in character as the patient.

Scenario title: ${scenario.title}
Personality style: ${scenario.personalityLabel} (${scenario.personality})
Patient name: ${scenario.patientName}
Language: ${scenario.language}
Treatment interest: ${scenario.treatment}
Seed intent: ${scenario.seedOpening}
Persona instructions: ${scenario.persona}

Output one realistic opening patient message in the exact language above.
Keep it between 1-3 sentences.

Return only JSON:
{
  "message": "first lead message",
  "shouldEnd": false,
  "mood": "short mood label"
}`;
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini response did not contain a JSON object.");
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
