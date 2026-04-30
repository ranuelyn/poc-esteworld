import { useState } from "react";
import type { ConversationMessage } from "../api/client";

export function ConversationComposer({
  disabled,
  onSend
}: {
  disabled: boolean;
  onSend: (role: ConversationMessage["role"], text: string) => void;
}) {
  const [role, setRole] = useState<ConversationMessage["role"]>("agent");
  const [text, setText] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }

    onSend(role, text.trim());
    setText("");
  }

  return (
    <form className="conversation-composer" onSubmit={submit}>
      <p className="section-label">Continue Conversation</p>
      <label>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value as ConversationMessage["role"])}>
          <option value="agent">Sales representative</option>
          <option value="lead">Lead / patient</option>
        </select>
      </label>
      <label>
        Message
        <textarea
          placeholder={
            role === "agent"
              ? "Write what the sales representative sends to the lead..."
              : "Write the lead's next answer..."
          }
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <button disabled={disabled || !text.trim()} type="submit">
        {disabled ? "Re-analysing..." : `Send as ${role === "agent" ? "sales rep" : "lead"}`}
      </button>
    </form>
  );
}
