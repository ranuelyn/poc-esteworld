import type { ChatMessage } from "../../domain/entities/ChatMessage.js";
import type { LeadAssessment } from "../../domain/entities/LeadAssessment.js";
import type { SalesBoostType, SuggestedReply } from "../../domain/entities/LeadAssessment.js";
import type { LeadSinkPort } from "../../domain/ports/LeadSinkPort.js";
import { env } from "../../config/env.js";

export interface CopilotCase {
  message: ChatMessage;
  conversation: ConversationMessage[];
  assessment?: LeadAssessment;
  status: "pending" | "ready" | "failed";
  selectedReplyId?: string;
  appliedBoosts: SalesBoostType[];
  boostedReply?: string;
  analysisStartedAt?: string;
  aiDurationMs?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "lead" | "agent";
  text: string;
  createdAt: string;
}

export class InMemoryLeadSink implements LeadSinkPort {
  private readonly cases = new Map<string, CopilotCase>();

  async save(assessment: LeadAssessment): Promise<void> {
    const existing = this.cases.get(assessment.messageId);
    const now = new Date().toISOString();
    const fallbackMessage: ChatMessage = {
      tenantId: assessment.tenantId,
      channel: "whatsapp",
      contactId: assessment.contactId,
      messageId: assessment.messageId,
      text: assessment.intent,
      receivedAt: assessment.createdAt
    };

    const nextCase: CopilotCase = {
      message: existing?.message ?? fallbackMessage,
      conversation: existing?.conversation ?? [
        {
          id: `${assessment.messageId}-lead-initial`,
          role: "lead",
          text: existing?.message.text ?? fallbackMessage.text,
          createdAt: assessment.createdAt
        }
      ],
      assessment,
      status: "ready",
      appliedBoosts: existing?.appliedBoosts ?? [],
      createdAt: existing?.createdAt ?? assessment.createdAt,
      updatedAt: now
    };

    if (existing?.analysisStartedAt) {
      nextCase.aiDurationMs = Math.max(0, Date.parse(now) - Date.parse(existing.analysisStartedAt));
    }
    if (existing?.errorMessage) {
      delete nextCase.errorMessage;
    }

    if (existing?.selectedReplyId) {
      nextCase.selectedReplyId = existing.selectedReplyId;
    }
    if (existing?.boostedReply) {
      nextCase.boostedReply = existing.boostedReply;
    }

    this.cases.set(assessment.messageId, nextCase);
  }

  upsertMessage(message: ChatMessage): CopilotCase {
    const existing = this.cases.get(message.messageId);
    const now = new Date().toISOString();
    const nextCase: CopilotCase = {
      message,
      conversation: existing?.conversation ?? [
        {
          id: `${message.messageId}-lead-initial`,
          role: "lead",
          text: message.text,
          createdAt: message.receivedAt
        }
      ],
      status: existing?.assessment ? "ready" : existing?.status === "failed" ? "failed" : "pending",
      appliedBoosts: existing?.appliedBoosts ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (!existing?.assessment) {
      nextCase.analysisStartedAt = now;
    } else if (existing.analysisStartedAt) {
      nextCase.analysisStartedAt = existing.analysisStartedAt;
    }

    if (existing?.assessment) {
      nextCase.assessment = existing.assessment;
    }
    if (existing?.selectedReplyId) {
      nextCase.selectedReplyId = existing.selectedReplyId;
    }
    if (existing?.boostedReply) {
      nextCase.boostedReply = existing.boostedReply;
    }

    this.cases.set(message.messageId, nextCase);
    return nextCase;
  }

  appendConversationMessage(
    messageId: string,
    role: ConversationMessage["role"],
    text: string
  ): { caseItem: CopilotCase; analysisMessage: ChatMessage } {
    const caseItem = this.requireCase(messageId);
    const now = new Date().toISOString();
    const nextConversation = [
      ...caseItem.conversation,
      {
        id: `${messageId}-${role}-${Date.now()}`,
        role,
        text,
        createdAt: now
      }
    ];
    const nextCase: CopilotCase = {
      ...caseItem,
      conversation: nextConversation,
      status: "pending",
      appliedBoosts: [],
      analysisStartedAt: now,
      updatedAt: now
    };

    delete nextCase.selectedReplyId;
    delete nextCase.boostedReply;
    delete nextCase.aiDurationMs;
    delete nextCase.errorMessage;

    this.cases.set(messageId, nextCase);

    return {
      caseItem: nextCase,
      analysisMessage: {
        ...caseItem.message,
        text: formatConversationForAnalysis(nextConversation),
        receivedAt: now
      }
    };
  }

  list(): LeadAssessment[] {
    return this.listCases()
      .map((caseItem) => caseItem.assessment)
      .filter((assessment): assessment is LeadAssessment => Boolean(assessment));
  }

  listCases(): CopilotCase[] {
    return [...this.cases.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getCase(messageId: string): CopilotCase | undefined {
    return this.cases.get(messageId);
  }

  pickReply(messageId: string, replyId: string): CopilotCase {
    const caseItem = this.requireCase(messageId);
    const selectedReply = caseItem.assessment?.suggestedReplies.find((reply) => reply.id === replyId);
    if (!selectedReply) {
      throw new Error(`Reply "${replyId}" not found for case "${messageId}".`);
    }

    const lastBoost = caseItem.appliedBoosts.at(-1);
    const nextCase: CopilotCase = {
      ...caseItem,
      selectedReplyId: replyId,
      updatedAt: new Date().toISOString()
    };

    if (lastBoost) {
      nextCase.boostedReply = buildBoostedReply(
        selectedReply.text,
        lastBoost,
        caseItem.message.language ?? caseItem.assessment?.analysis.language
      );
    } else if (caseItem.boostedReply) {
      nextCase.boostedReply = selectedReply.text;
    }

    this.cases.set(messageId, nextCase);
    return nextCase;
  }

  applyBoost(messageId: string, boostType: SalesBoostType): CopilotCase {
    const caseItem = this.requireCase(messageId);
    const recommendedReply =
      caseItem.assessment?.suggestedReplies.find((reply) => reply.id === caseItem.selectedReplyId) ??
      caseItem.assessment?.suggestedReplies.find((reply) => reply.isRecommended) ??
      caseItem.assessment?.suggestedReplies[0];

    if (!recommendedReply) {
      throw new Error(`Case "${messageId}" has no suggested reply to boost.`);
    }

    const nextCase = {
      ...caseItem,
      appliedBoosts: [...caseItem.appliedBoosts, boostType],
      boostedReply: buildBoostedReply(
        recommendedReply.text,
        boostType,
        caseItem.message.language ?? caseItem.assessment?.analysis.language
      ),
      updatedAt: new Date().toISOString()
    };
    this.cases.set(messageId, nextCase);
    return nextCase;
  }

  markFailed(messageId: string, errorMessage: string): CopilotCase {
    const caseItem = this.requireCase(messageId);
    const now = new Date().toISOString();
    const nextCase: CopilotCase = {
      ...caseItem,
      status: "failed",
      errorMessage,
      updatedAt: now
    };

    if (caseItem.analysisStartedAt) {
      nextCase.aiDurationMs = Math.max(0, Date.parse(now) - Date.parse(caseItem.analysisStartedAt));
    } else if (caseItem.aiDurationMs) {
      nextCase.aiDurationMs = caseItem.aiDurationMs;
    }

    this.cases.set(messageId, nextCase);
    return nextCase;
  }

  getAdminMetrics() {
    const cases = this.listCases();
    const readyCases = cases.filter((caseItem) => caseItem.status === "ready");
    const hotCases = readyCases.filter(
      (caseItem) => caseItem.assessment?.analysis.leadTemperature === "hot"
    );
    const selectedCases = readyCases.filter((caseItem) => caseItem.selectedReplyId);
    const avgResponseMs = average(
      readyCases.map((caseItem) => caseItem.aiDurationMs ?? 0)
    );
    const replyPatterns = buildReplyPatterns(readyCases);
    const leaderboard = buildLeaderboard(cases);

    return {
      summary: {
        leadsAnswered: readyCases.length,
        dealsClosed: hotCases.filter((caseItem) => caseItem.selectedReplyId).length,
        avgResponseTime: formatDuration(avgResponseMs),
        aiUsage: cases.length > 0 ? Math.round((readyCases.length / cases.length) * 100) : 0
      },
      conversions: buildConversions(readyCases, selectedCases),
      replyPatterns,
      leaderboard,
      closedRecently: hotCases.slice(0, 5).map((caseItem) => ({
        patient: caseItem.message.patientName ?? caseItem.message.contactId,
        treatment: caseItem.assessment?.analysis.treatment ?? "Treatment",
        agent: getAgentName(caseItem),
        value: `${caseItem.assessment?.analysis.leadScore ?? 0}% score`,
        timeAgo: timeAgo(caseItem.updatedAt)
      }))
    };
  }

  private requireCase(messageId: string): CopilotCase {
    const caseItem = this.cases.get(messageId);
    if (!caseItem) {
      throw new Error(`Case "${messageId}" not found.`);
    }
    return caseItem;
  }
}

export class HttpLeadSink implements LeadSinkPort {
  constructor(
    private readonly endpoint = env.MOCK_ZOHO_URL,
    private readonly timeoutMs = env.OLLAMA_REQUEST_TIMEOUT_MS
  ) {}

  async save(assessment: LeadAssessment): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(assessment),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Mock Zoho endpoint failed with status ${response.status}.`);
    }
  }

  async fail(messageId: string, errorMessage: string): Promise<void> {
    const response = await fetch(`${this.endpoint}/fail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId, errorMessage }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Mock Zoho failure endpoint failed with status ${response.status}.`);
    }
  }
}

export const inMemoryLeadSink = new InMemoryLeadSink();

function buildBoostedReply(text: string, boostType: SalesBoostType, language?: string): string {
  const isEnglish = language?.toLowerCase().includes("english") ?? false;

  switch (boostType) {
    case "shorter":
      return text.split(".").slice(0, 2).join(".").trim() + ".";
    case "more_trustworthy":
      return isEnglish
        ? `${text}\n\nAfter the doctor's pre-assessment, I can share the safest and clearest plan for you.`
        : `${text}\n\nDoktor ön değerlendirmesi sonrası size net ve güvenli planı paylaşacağız.`;
    case "more_persuasive":
      return isEnglish
        ? `${text}\n\nIf you like, I can hold the most suitable date for you while we finalise the details.`
        : `${text}\n\nUygun tarihi korumak için isterseniz şimdi sizin adınıza opsiyonlayabilirim.`;
    case "ask_for_photos":
      return isEnglish
        ? `${text}\n\nIf convenient, could you share a few front, side, and relevant area photos for the doctor's review?`
        : `${text}\n\nUygunsa önden, yandan ve ilgili bölgeden birkaç fotoğraf paylaşabilir misiniz?`;
    case "ask_travel_dates":
      return isEnglish
        ? `${text}\n\nWhich travel dates are you considering? I can check suitable doctor and procedure availability around them.`
        : `${text}\n\nSeyahat etmeyi düşündüğünüz tarih aralığı nedir? Ona göre uygun doktor ve operasyon günlerini kontrol edeyim.`;
    case "ask_for_deposit":
      return isEnglish
        ? `${text}\n\nOnce the plan is clear, I can also share the soft reservation step to secure the date.`
        : `${text}\n\nPlanı netleştirdikten sonra tarihi garantiye almak için yumuşak rezervasyon adımını paylaşabilirim.`;
    case "confirm_flights":
      return isEnglish
        ? `${text}\n\nIf your flights are already set, please share the arrival and return dates so I can align transfers and check-ups.`
        : `${text}\n\nUçuş tarihiniz belli olduysa geliş-dönüş günlerini de yazarsanız transfer ve kontrol planını netleştireyim.`;
    case "make_softer":
      return isEnglish ? `Of course, happy to help. ${text}` : `Elbette, memnuniyetle yardımcı olurum. ${text}`;
  }
}

function buildReplyPatterns(cases: CopilotCase[]) {
  const counts = new Map<string, number>();
  for (const caseItem of cases) {
    const selectedReply = findSelectedReply(caseItem);
    if (selectedReply) {
      counts.set(selectedReply.label, (counts.get(selectedReply.label) ?? 0) + 1);
    }

    for (const boost of caseItem.appliedBoosts) {
      counts.set(boostLabel(boost), (counts.get(boostLabel(boost)) ?? 0) + 1);
    }
  }

  const total = Math.max(cases.length, 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      conversion: Math.round((count / total) * 100)
    }));
}

function buildConversions(readyCases: CopilotCase[], selectedCases: CopilotCase[]) {
  const days = [...Array(7).keys()].map((offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    return date;
  });

  return days.map((date) => {
    const dateKey = date.toISOString().slice(0, 10);
    return {
      week: date.toLocaleDateString("en-GB", { weekday: "short" }),
      withCopilot: selectedCases.filter((caseItem) => sameDate(caseItem.updatedAt, dateKey)).length,
      manual: readyCases.filter((caseItem) => sameDate(caseItem.updatedAt, dateKey)).length
    };
  });
}

function buildLeaderboard(cases: CopilotCase[]) {
  const byAgent = new Map<string, CopilotCase[]>();
  for (const caseItem of cases) {
    const agent = getAgentName(caseItem);
    byAgent.set(agent, [...(byAgent.get(agent) ?? []), caseItem]);
  }

  return [...byAgent.entries()].map(([agent, agentCases]) => {
    const ready = agentCases.filter((caseItem) => caseItem.status === "ready");
    const deals = ready.filter((caseItem) => caseItem.assessment?.analysis.leadTemperature === "hot").length;
    return {
      agent,
      role: "Sales Agent",
      deals,
      aiUse: agentCases.length > 0 ? Math.round((ready.length / agentCases.length) * 100) : 0,
      revenue: `${ready.reduce((sum, caseItem) => sum + (caseItem.assessment?.analysis.leadScore ?? 0), 0)} pts`
    };
  });
}

function findSelectedReply(caseItem: CopilotCase): SuggestedReply | undefined {
  return caseItem.assessment?.suggestedReplies.find((reply) => reply.id === caseItem.selectedReplyId);
}

function boostLabel(boost: SalesBoostType): string {
  return boost
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAgentName(caseItem: CopilotCase): string {
  const rawPayload = caseItem.message.rawPayload;
  if (isRecord(rawPayload) && typeof rawPayload.agent_name === "string") {
    return rawPayload.agent_name;
  }

  return "Unassigned";
}

function sameDate(isoDate: string, dateKey: string): boolean {
  return isoDate.slice(0, 10) === dateKey;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + Math.max(value, 0), 0) / values.length;
}

function formatDuration(ms: number): string {
  if (ms <= 0) {
    return "0s";
  }

  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function timeAgo(isoDate: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(isoDate)) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  return `${Math.floor(minutes / 60)}h ago`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatConversationForAnalysis(conversation: ConversationMessage[]): string {
  const transcript = conversation
    .map((message) => {
      const role = message.role === "agent" ? "Sales representative" : "Lead";
      return `${role} (${message.createdAt}): ${message.text}`;
    })
    .join("\n");
  const latestMessage = conversation.at(-1);
  const latestRole = latestMessage?.role === "agent" ? "Sales representative" : "Lead";

  return `${transcript}\n\nLatest speaker: ${latestRole}`;
}
