export type LeadTemperature = "cold" | "warm" | "hot";

export interface CopilotCase {
  message: {
    tenantId: string;
    clinicName?: string;
    contactId: string;
    messageId: string;
    patientName?: string;
    language?: string;
    treatment?: string;
    text: string;
    receivedAt: string;
  };
  conversation: ConversationMessage[];
  assessment?: LeadAssessment;
  status: "pending" | "ready" | "failed";
  selectedReplyId?: string;
  appliedBoosts: string[];
  boostedReply?: string;
  agentPerformance?: AgentPerformance;
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

export interface AgentPerformance {
  score: number;
  label: "excellent" | "good" | "needs_attention" | "risky";
  notes: string[];
}

export interface LeadAssessment {
  tenantId: string;
  contactId: string;
  messageId: string;
  sourceMessageText?: string;
  analysis: {
    language: string;
    treatment: string;
    intent: string;
    leadTemperature: LeadTemperature;
    leadScore: number;
    confidence: number;
    signals: string[];
  };
  funnelStage?: {
    stage: number;
    label: string;
    nextMilestone: string;
  };
  nextBestAction: {
    title: string;
    rationale: string;
    evidence: string;
  };
  suggestedReplies: Array<{
    id: string;
    style: "professional" | "warm_trust" | "closing_focused";
    label: string;
    text: string;
    isRecommended: boolean;
  }>;
  salesBoosts: Array<{
    type: string;
    label: string;
    promptHint: string;
  }>;
  silencePlan: Array<{
    day: 1 | 3 | 7 | 14;
    action: string;
  }>;
  followUpQuestions: string[];
  riskFlags: string[];
  retrievedDialogueIds: string[];
  createdAt: string;
}

export interface AdminMetrics {
  summary: {
    leadsAnswered: number;
    dealsClosed: number;
    avgResponseTime: string;
    aiUsage: number;
  };
  conversions: Array<{ week: string; withCopilot: number; manual: number }>;
  replyPatterns: Array<{ label: string; conversion: number }>;
  leaderboard: Array<{ agent: string; role: string; deals: number; aiUse: number; revenue: string }>;
  closedRecently: Array<{
    patient: string;
    treatment: string;
    agent: string;
    value: string;
    timeAgo: string;
  }>;
}

export interface SendLeadPayload {
  tenant_id: string;
  clinic_name: string;
  contact_id: string;
  patient_name: string;
  language: string;
  treatment: string;
  message_id: string;
  text: string;
  scenario_id?: string;
}

export interface TestScenario {
  id: string;
  title: string;
  personality: string;
  personalityLabel: string;
  patientName: string;
  language: string;
  treatment: string;
  seedOpening: string;
  persona: string;
  maxTurns: number;
}

export async function sendLeadMessage(payload: SendLeadPayload) {
  return request<{ accepted: boolean; jobId: string; messageId: string }>("/api/webhook/wazzup", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listCases() {
  return request<{ cases: CopilotCase[] }>("/api/copilot/cases");
}

export async function getCase(messageId: string) {
  return request<{ case: CopilotCase }>(`/api/copilot/cases/${messageId}`);
}

export async function pickReply(messageId: string, replyId: string) {
  return request<{ case: CopilotCase }>(
    `/api/copilot/cases/${messageId}/replies/${replyId}/pick`,
    { method: "POST" }
  );
}

export async function applyBoost(messageId: string, boostType: string) {
  return request<{ case: CopilotCase }>(`/api/copilot/cases/${messageId}/boost`, {
    method: "POST",
    body: JSON.stringify({ boostType })
  });
}

export async function appendConversationMessage(
  messageId: string,
  payload: { role: "lead" | "agent"; text: string }
) {
  return request<{ accepted: boolean; jobId: string; case: CopilotCase }>(
    `/api/copilot/cases/${messageId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function getAdminMetrics() {
  return request<AdminMetrics>("/api/admin/metrics");
}

export async function listTestScenarios() {
  return request<{ scenarios: TestScenario[] }>("/api/test/scenarios");
}

export async function generateTestLeadReply(messageId: string) {
  return request<{ message: string; shouldEnd: boolean; mood: string }>(
    `/api/test/cases/${messageId}/lead-reply`,
    { method: "POST" }
  );
}

export async function generateTestScenarioOpening(scenarioId: string) {
  return request<{
    scenario: TestScenario;
    opening: { message: string; shouldEnd: boolean; mood: string };
  }>(`/api/test/scenarios/${scenarioId}/opening`, { method: "POST" });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

// --- Demo Patient API ---

export interface DemoPatient {
  patientId: string;
  patientName: string;
  interest: string;
  value: number;
  messageCount: number;
  agentNames: string[];
  firstMessageAt: string;
}

export async function listDemoPatients(query?: string) {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<{ patients: DemoPatient[]; loaded: boolean; total?: number }>(
    `/api/demo/patients${params}`
  );
}

export async function loadDemoPatient(patientId: string) {
  return request<{
    accepted: boolean;
    jobId: string;
    messageId: string;
    patient: DemoPatient;
  }>("/api/demo/load-patient", {
    method: "POST",
    body: JSON.stringify({ patientId })
  });
}
