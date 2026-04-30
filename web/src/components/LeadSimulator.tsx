import { useState } from "react";
import type { SendLeadPayload } from "../api/client";

const defaultText =
  "Hi, I am interested in rhinoplasty in June. Can you share hotel options and total schedule? I can send photos.";

export function LeadSimulator({
  disabled,
  onSend,
  onCancel
}: {
  disabled: boolean;
  onSend: (payload: SendLeadPayload) => void;
  onCancel?: () => void;
}) {
  const [tenantId, setTenantId] = useState("esteworld-istanbul");
  const [patientName, setPatientName] = useState("Isabel M.");
  const [language, setLanguage] = useState("English (UK)");
  const [treatment, setTreatment] = useState("Rhinoplasty");
  const [text, setText] = useState(defaultText);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const messageId = `ui-${Date.now()}`;
    onSend({
      tenant_id: tenantId,
      clinic_name: tenantId === "esteworld-istanbul" ? "Esteworld Istanbul" : "Demo Clinic London",
      contact_id: `ui:${patientName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      patient_name: patientName,
      language,
      treatment,
      message_id: messageId,
      text
    });
  }

  return (
    <form className="lead-simulator" onSubmit={submit}>
      <div className="section-row">
        <p className="section-label">New Chat</p>
        {onCancel ? (
          <button className="ghost-button compact" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      <label>
        Tenant
        <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
          <option value="esteworld-istanbul">Esteworld Istanbul</option>
          <option value="demo-clinic-london">Demo Clinic London</option>
        </select>
      </label>
      <label>
        Patient
        <input value={patientName} onChange={(event) => setPatientName(event.target.value)} />
      </label>
      <label>
        Language
        <input value={language} onChange={(event) => setLanguage(event.target.value)} />
      </label>
      <label>
        Treatment
        <input value={treatment} onChange={(event) => setTreatment(event.target.value)} />
      </label>
      <label>
        Lead message
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} />
      </label>
      <button disabled={disabled} type="submit">
        {disabled ? "Creating..." : "Create chat"}
      </button>
    </form>
  );
}
