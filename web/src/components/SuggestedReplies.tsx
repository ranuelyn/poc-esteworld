import { useMemo, useState } from "react";
import type { CopilotCase } from "../api/client";

const replyOrder = ["professional", "warm_trust", "closing_focused"];

export function SuggestedReplies({
  caseItem,
  onPick
}: {
  caseItem?: CopilotCase;
  onPick: (replyId: string) => void;
}) {
  const [copiedId, setCopiedId] = useState<string>();
  const replies = useMemo(
    () =>
      [...(caseItem?.assessment?.suggestedReplies ?? [])].sort(
        (a, b) => replyOrder.indexOf(a.style) - replyOrder.indexOf(b.style)
      ),
    [caseItem?.assessment?.suggestedReplies]
  );

  async function copyText(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(undefined), 1400);
  }

  return (
    <section className="split-section">
      <div className="section-row">
        <p className="section-label">Suggested Replies</p>
        <button className="ghost-button" type="button" disabled={!caseItem?.assessment}>
          Regenerate
        </button>
      </div>
      <div className="reply-list">
        {caseItem?.status === "failed" ? (
          <div className="empty-card error-card">
            AI analysis failed. Send another message in this chat to retry.
            {caseItem.errorMessage ? <small>{caseItem.errorMessage}</small> : null}
          </div>
        ) : replies.length === 0 ? (
          <div className="empty-card">Waiting for AI reply variants.</div>
        ) : (
          replies.map((reply, index) => {
            const selected = caseItem?.selectedReplyId === reply.id;
            return (
              <article
                className={`reply-card ${reply.isRecommended || selected ? "recommended" : ""}`}
                key={reply.id}
              >
                <div className="reply-heading">
                  <span className="reply-number">{index + 1}</span>
                  <strong>{reply.label}</strong>
                  {reply.isRecommended ? <span className="pick-badge">Pick</span> : null}
                  <button
                    className="copy-button"
                    type="button"
                    onClick={() => void copyText(reply.id, reply.text)}
                  >
                    {copiedId === reply.id ? "Copied" : "Copy"}
                  </button>
                </div>
                <p>{reply.text}</p>
                <button type="button" onClick={() => onPick(reply.id)}>
                  {selected ? "Selected" : "Use this reply"}
                </button>
              </article>
            );
          })
        )}
      </div>
      {caseItem?.boostedReply ? (
        <article className="reply-card boosted">
          <div className="reply-heading">
            <strong>Boosted Draft</strong>
            <button
              className="copy-button"
              type="button"
              onClick={() => void copyText("boosted", caseItem.boostedReply ?? "")}
            >
              {copiedId === "boosted" ? "Copied" : "Copy"}
            </button>
          </div>
          <p>{caseItem.boostedReply}</p>
        </article>
      ) : null}
    </section>
  );
}
