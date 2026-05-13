import { useEffect, useMemo, useState } from "react";
import {
  appendConversationMessage,
  applyBoost,
  generateTestLeadReply,
  generateTestScenarioOpening,
  getAdminMetrics,
  getCase,
  listTestScenarios,
  listCases,
  pickReply,
  sendLeadMessage,
  type AdminMetrics,
  type CopilotCase,
  type SendLeadPayload,
  type TestScenario
} from "./api/client";
import { AdminDashboard } from "./components/AdminDashboard";
import { ConversationComposer } from "./components/ConversationComposer";
import { DemoPatientPicker } from "./components/DemoPatientPicker";
import { LeadSimulator } from "./components/LeadSimulator";
import { MessageAnalysisCards } from "./components/MessageAnalysisCards";
import { NextBestActionCard } from "./components/NextBestActionCard";
import { SalesBoostPanel } from "./components/SalesBoostPanel";
import { SilencePlan } from "./components/SilencePlan";
import { SuggestedReplies } from "./components/SuggestedReplies";
import { QdrantViewer } from "./components/QdrantViewer";

type ViewMode = "copilot" | "admin" | "qdrant";

export function App() {
  const [mode, setMode] = useState<ViewMode>("copilot");
  const [cases, setCases] = useState<CopilotCase[]>([]);
  const [activeMessageId, setActiveMessageId] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testStatus, setTestStatus] = useState<string>();
  const [testScenarios, setTestScenarios] = useState<TestScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>();
  const [error, setError] = useState<string>();
  const [metrics, setMetrics] = useState<AdminMetrics>();
  const [isDemoPickerOpen, setIsDemoPickerOpen] = useState(false);

  const activeCase = useMemo(
    () => cases.find((caseItem) => caseItem.message.messageId === activeMessageId) ?? cases[0],
    [activeMessageId, cases]
  );

  useEffect(() => {
    void refreshCases();
    void refreshMetrics();
    void refreshScenarios();
    const interval = window.setInterval(() => {
      void refreshCases();
      void refreshMetrics();
    }, 3000);

    return () => window.clearInterval(interval);
  }, []);

  async function refreshCases() {
    const response = await listCases();
    setCases(response.cases);
    if (!activeMessageId && response.cases[0]) {
      setActiveMessageId(response.cases[0].message.messageId);
    }
  }

  async function refreshMetrics() {
    setMetrics(await getAdminMetrics());
  }

  async function refreshScenarios() {
    const response = await listTestScenarios();
    setTestScenarios(response.scenarios);
    if (!selectedScenarioId && response.scenarios[0]) {
      setSelectedScenarioId(response.scenarios[0].id);
    }
  }

  async function handleSendLead(payload: SendLeadPayload) {
    setIsSubmitting(true);
    setError(undefined);
    try {
      const response = await sendLeadMessage(payload);
      setActiveMessageId(response.messageId);
      setIsCreatingChat(false);
      await pollCaseUntilReady(response.messageId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lead message failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function pollCaseUntilReady(messageId: string): Promise<CopilotCase> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await getCase(messageId);
      setCases((current) => upsertCase(current, response.case));
      if (response.case.status === "ready") {
        return response.case;
      }
      if (response.case.status === "failed") {
        throw new Error(response.case.errorMessage ?? "AI analysis failed");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error("AI analysis timed out");
  }

  async function handlePick(replyId: string) {
    if (!activeCase) return;
    const response = await pickReply(activeCase.message.messageId, replyId);
    setCases((current) => upsertCase(current, response.case));
  }

  async function handleBoost(boostType: string) {
    if (!activeCase) return;
    const response = await applyBoost(activeCase.message.messageId, boostType);
    setCases((current) => upsertCase(current, response.case));
  }

  async function handleConversationMessage(role: "lead" | "agent", text: string) {
    if (!activeCase) return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      const response = await appendConversationMessage(activeCase.message.messageId, { role, text });
      setCases((current) => upsertCase(current, response.case));
      await pollCaseUntilReady(activeCase.message.messageId);
      await refreshMetrics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Conversation message failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRunTestScenario() {
    setIsTestRunning(true);
    setError(undefined);
    setTestStatus("Preparing automated scenario...");
    try {
      const scenario =
        testScenarios.find((candidate) => candidate.id === selectedScenarioId) ??
        pickScenario(testScenarios);
      const messageId = `test-${scenario.id}-${Date.now()}`;
      setTestStatus(`Starting: ${scenario.title} (${scenario.personalityLabel})`);
      const openingResponse = await withRetries(
        async () => generateTestScenarioOpening(scenario.id),
        {
          maxAttempts: 8,
          baseDelayMs: 1800,
          onRetry: (attempt, delayMs) =>
            setTestStatus(
              `Generating first lead message, retry ${attempt}/8 in ${Math.ceil(delayMs / 1000)}s...`
            )
        }
      );
      const firstLeadMessage = openingResponse.opening.message;
      const response = await sendLeadMessage({
        tenant_id: "esteworld-demo",
        clinic_name: "Esteworld",
        contact_id: `demo-${scenario.id}`,
        patient_name: scenario.patientName,
        language: scenario.language,
        treatment: scenario.treatment,
        message_id: messageId,
        text: firstLeadMessage,
        scenario_id: scenario.id
      });

      setMode("copilot");
      setActiveMessageId(response.messageId);
      setIsCreatingChat(false);

      let caseItem = await pollCaseUntilReady(response.messageId);
      for (let turn = 0; turn < scenario.maxTurns; turn += 1) {
        const reply = findAutoReply(caseItem);
        if (!reply) {
          throw new Error("No AI suggested reply was available for the automated test.");
        }

        setTestStatus(`Turn ${turn + 1}: AI sales rep is answering...`);
        const agentResponse = await withRetries(
          async () =>
            appendConversationMessage(response.messageId, {
              role: "agent",
              text: reply
            }),
          {
            maxAttempts: 4,
            baseDelayMs: 1200,
            onRetry: (attempt, delayMs) =>
              setTestStatus(
                `Turn ${turn + 1}: agent send retry ${attempt}/4 in ${Math.ceil(delayMs / 1000)}s...`
              )
          }
        );
        setCases((current) => upsertCase(current, agentResponse.case));
        caseItem = await pollCaseUntilReady(response.messageId);

        setTestStatus(`Turn ${turn + 1}: Gemini lead is reacting...`);
        const leadReply = await withRetries(
          async () => generateTestLeadReply(response.messageId),
          {
            maxAttempts: 8,
            baseDelayMs: 2000,
            onRetry: (attempt, delayMs) =>
              setTestStatus(
                `Turn ${turn + 1}: Gemini busy, retry ${attempt}/8 in ${Math.ceil(delayMs / 1000)}s...`
              )
          }
        ).catch(() => ({
          shouldEnd: false,
          mood: "fallback",
          message:
            "Thanks. I still need a moment to decide. Could you share one concrete next step and timeline?"
        }));

        if (leadReply.shouldEnd && turn > 0) {
          setTestStatus(`Scenario completed: ${leadReply.mood}`);
          break;
        }

        const leadResponse = await withRetries(
          async () =>
            appendConversationMessage(response.messageId, {
              role: "lead",
              text: leadReply.message
            }),
          {
            maxAttempts: 4,
            baseDelayMs: 1200,
            onRetry: (attempt, delayMs) =>
              setTestStatus(
                `Turn ${turn + 1}: lead send retry ${attempt}/4 in ${Math.ceil(delayMs / 1000)}s...`
              )
          }
        );
        setCases((current) => upsertCase(current, leadResponse.case));
        caseItem = await pollCaseUntilReady(response.messageId);
      }

      setTestStatus("Automated test scenario completed.");
      await refreshMetrics();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Automated test failed");
      setTestStatus(undefined);
    } finally {
      setIsTestRunning(false);
    }
  }

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div>
          <p className="eyebrow">Esteworld PoC</p>
          <h1>AI Sales Copilot</h1>
        </div>
        <div className="nav-actions">
          <button className={mode === "copilot" ? "active" : ""} onClick={() => setMode("copilot")}>
            Sales Copilot
          </button>
          <button className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>
            Admin Dashboard
          </button>
          <button className={mode === "qdrant" ? "active" : ""} onClick={() => setMode("qdrant")}>
            🔍 Qdrant RAG
          </button>
          <button
            className={`test-button ${isTestRunning ? "test-running" : ""}`}
            disabled={isTestRunning}
            onClick={handleRunTestScenario}
          >
            {isTestRunning ? "Running test..." : "Run Test"}
          </button>
          <select
            value={selectedScenarioId ?? ""}
            onChange={(event) => setSelectedScenarioId(event.target.value)}
            disabled={isTestRunning || testScenarios.length === 0}
          >
            {testScenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.personalityLabel} - {scenario.patientName}
              </option>
            ))}
          </select>
        </div>
      </nav>

      {mode === "qdrant" ? (
        <QdrantViewer />
      ) : mode === "admin" ? (
        <AdminDashboard metrics={metrics} />
      ) : (
        <main className={`copilot-layout ${activeCase ? "" : "no-active-chat"}`}>
          <aside className="wazzup-pane">
            <div className="chat-sidebar-header">
              <div>
                <p className="eyebrow">Wazzup</p>
                <h2>Chats</h2>
              </div>
              <div className="sidebar-actions">
                <button type="button" className="demo-btn" onClick={() => { setIsDemoPickerOpen(!isDemoPickerOpen); setIsCreatingChat(false); }}>
                  📋 Real Case
                </button>
                <button type="button" onClick={() => { setIsCreatingChat(true); setIsDemoPickerOpen(false); }}>
                  New chat
                </button>
              </div>
            </div>
            {isDemoPickerOpen ? (
              <DemoPatientPicker
                disabled={isSubmitting}
                onLoaded={(messageId) => {
                  setActiveMessageId(messageId);
                  setIsDemoPickerOpen(false);
                  void refreshCases();
                  void pollCaseUntilReady(messageId).then((ready) => {
                    setCases((current) => upsertCase(current, ready));
                  });
                }}
                onCancel={() => setIsDemoPickerOpen(false)}
              />
            ) : null}
            {isCreatingChat ? (
              <LeadSimulator
                disabled={isSubmitting}
                onSend={handleSendLead}
                onCancel={() => setIsCreatingChat(false)}
              />
            ) : null}
            {error ? <div className="error-box">{error}</div> : null}
            {testStatus ? <div className="test-status">{testStatus}</div> : null}
            <section className="case-list">
              <p className="section-label">Recent Chats</p>
              {cases.length === 0 ? (
                <p className="empty-state">Create a new chat to start testing scenarios.</p>
              ) : (
                cases.map((caseItem) => (
                  <button
                    className={caseItem.message.messageId === activeCase?.message.messageId ? "active" : ""}
                    key={caseItem.message.messageId}
                    type="button"
                    onClick={() => {
                      setActiveMessageId(caseItem.message.messageId);
                      setIsCreatingChat(false);
                    }}
                  >
                    <div className="chat-list-row">
                      <strong>{leadListTitle(caseItem)}</strong>
                      <span className={`mini-status ${caseItem.status}`}>{caseItem.status}</span>
                    </div>
                    <span>{lastConversationPreview(caseItem)}</span>
                  </button>
                ))
              )}
            </section>
          </aside>

          {activeCase ? (
            <>
              <section className="phone-frame">
                <div className="conversation-header">
                  <div>
                    <p className="eyebrow">Wazzup chat simulation</p>
                    <h2>{leadListTitle(activeCase)}</h2>
                  </div>
                  <span className={`status-pill ${activeCase.status}`}>
                    {activeCase.status}
                  </span>
                </div>
                <div className="lead-message">
                  <div className="conversation-thread">
                    {activeCase.conversation.map((message) => (
                      <article className={`chat-bubble ${message.role}`} key={message.id}>
                        <span>{message.role === "agent" ? "Sales rep" : "Lead"}</span>
                        <p>{message.text}</p>
                      </article>
                    ))}
                  </div>
                </div>
                <ConversationComposer disabled={isSubmitting} onSend={handleConversationMessage} />
              </section>

              <aside className="copilot-panel">
                <MessageAnalysisCards assessment={activeCase.assessment} caseItem={activeCase} />
                <NextBestActionCard assessment={activeCase.assessment} />
                <SuggestedReplies caseItem={activeCase} onPick={handlePick} />
                <SalesBoostPanel assessment={activeCase.assessment} onBoost={handleBoost} />
                <SilencePlan assessment={activeCase.assessment} />
              </aside>
            </>
          ) : (
            <section className="phone-frame empty-chat-frame">
              <div>
                <p className="eyebrow">Wazzup chat simulation</p>
                <h2>Select a chat or create a new one</h2>
                <p className="empty-state">
                  Use the left sidebar to create separate test scenarios, then jump between chats without starting over.
                </p>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

function leadListTitle(caseItem: CopilotCase): string {
  if (caseItem.message.patientName?.trim()) {
    return caseItem.message.patientName.trim();
  }
  const mid = caseItem.message.messageId;
  if (/^closewon-/i.test(mid)) {
    const tail = mid.replace(/^closewon-/i, "").slice(0, 14);
    return tail ? `Close-won · ${tail}` : "Close-won transcript";
  }
  const c = caseItem.message.contactId.replace(/^whatsapp:\+/i, "");
  if (c.length > 0 && c.length <= 28) {
    return c;
  }
  return "Unknown lead";
}

function lastConversationPreview(caseItem: CopilotCase): string {
  const lastMessage = caseItem.conversation.at(-1);
  if (!lastMessage) {
    return caseItem.assessment?.analysis.intent ?? caseItem.status;
  }

  const raw = `${lastMessage.role === "agent" ? "You" : caseItem.message.patientName ?? "Lead"}: ${lastMessage.text}`;
  if (raw.length <= 96) {
    return raw;
  }
  return `${raw.slice(0, 93)}…`;
}

function upsertCase(cases: CopilotCase[], nextCase: CopilotCase): CopilotCase[] {
  const exists = cases.some((caseItem) => caseItem.message.messageId === nextCase.message.messageId);
  if (!exists) {
    return [nextCase, ...cases];
  }

  return cases.map((caseItem) =>
    caseItem.message.messageId === nextCase.message.messageId ? nextCase : caseItem
  );
}

function findAutoReply(caseItem: CopilotCase): string | undefined {
  return (
    caseItem.boostedReply ??
    caseItem.assessment?.suggestedReplies.find((reply) => reply.isRecommended)?.text ??
    caseItem.assessment?.suggestedReplies[0]?.text
  );
}

function pickScenario(scenarios: TestScenario[]): TestScenario {
  if (scenarios.length === 0) {
    throw new Error("No automated test scenarios are configured.");
  }

  return scenarios[Math.floor(Math.random() * scenarios.length)];
}

interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  onRetry?: (attempt: number, delayMs: number) => void;
}

async function withRetries<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const resolved = error instanceof Error ? error : new Error("Unknown retry error");
      lastError = resolved;
      if (attempt === options.maxAttempts) {
        throw resolved;
      }

      const delayMs = retryDelay(options.baseDelayMs, attempt);
      options.onRetry?.(attempt + 1, delayMs);
      await wait(delayMs);
    }
  }

  throw lastError ?? new Error("Retry failed");
}

function retryDelay(baseDelayMs: number, attempt: number): number {
  const cappedAttempt = Math.min(attempt, 6);
  const exponential = baseDelayMs * 2 ** (cappedAttempt - 1);
  const jitter = Math.floor(Math.random() * Math.floor(baseDelayMs / 2));
  return exponential + jitter;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}
