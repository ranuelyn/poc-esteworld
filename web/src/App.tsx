import { useEffect, useMemo, useState } from "react";
import {
  appendConversationMessage,
  applyBoost,
  getAdminMetrics,
  getCase,
  listCases,
  pickReply,
  sendLeadMessage,
  type AdminMetrics,
  type CopilotCase,
  type SendLeadPayload
} from "./api/client";
import { AdminDashboard } from "./components/AdminDashboard";
import { ConversationComposer } from "./components/ConversationComposer";
import { LeadSimulator } from "./components/LeadSimulator";
import { MessageAnalysisCards } from "./components/MessageAnalysisCards";
import { NextBestActionCard } from "./components/NextBestActionCard";
import { SalesBoostPanel } from "./components/SalesBoostPanel";
import { SilencePlan } from "./components/SilencePlan";
import { SuggestedReplies } from "./components/SuggestedReplies";

type ViewMode = "copilot" | "admin";

export function App() {
  const [mode, setMode] = useState<ViewMode>("copilot");
  const [cases, setCases] = useState<CopilotCase[]>([]);
  const [activeMessageId, setActiveMessageId] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [error, setError] = useState<string>();
  const [metrics, setMetrics] = useState<AdminMetrics>();

  const activeCase = useMemo(
    () => cases.find((caseItem) => caseItem.message.messageId === activeMessageId) ?? cases[0],
    [activeMessageId, cases]
  );

  useEffect(() => {
    void refreshCases();
    void refreshMetrics();
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

  async function pollCaseUntilReady(messageId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await getCase(messageId);
      setCases((current) => upsertCase(current, response.case));
      if (response.case.status === "ready") {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
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
        </div>
      </nav>

      {mode === "admin" ? (
        <AdminDashboard metrics={metrics} />
      ) : (
        <main className={`copilot-layout ${activeCase ? "" : "no-active-chat"}`}>
          <aside className="wazzup-pane">
            <div className="chat-sidebar-header">
              <div>
                <p className="eyebrow">Wazzup</p>
                <h2>Chats</h2>
              </div>
              <button type="button" onClick={() => setIsCreatingChat(true)}>
                New chat
              </button>
            </div>
            {isCreatingChat ? (
              <LeadSimulator
                disabled={isSubmitting}
                onSend={handleSendLead}
                onCancel={() => setIsCreatingChat(false)}
              />
            ) : null}
            {error ? <div className="error-box">{error}</div> : null}
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
                      <strong>{caseItem.message.patientName ?? "Unknown lead"}</strong>
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
                    <h2>{activeCase.message.patientName ?? "Unknown lead"}</h2>
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

function lastConversationPreview(caseItem: CopilotCase): string {
  const lastMessage = caseItem.conversation.at(-1);
  if (!lastMessage) {
    return caseItem.assessment?.analysis.intent ?? caseItem.status;
  }

  return `${lastMessage.role === "agent" ? "You" : caseItem.message.patientName ?? "Lead"}: ${lastMessage.text}`;
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
