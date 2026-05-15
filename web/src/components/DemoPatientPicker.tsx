import { useEffect, useState } from "react";
import { listDemoPatients, loadDemoPatient, type DemoPatient } from "../api/client";

interface DemoPatientPickerProps {
  disabled?: boolean;
  onLoaded: (messageId: string) => void;
  onCancel: () => void;
}

const INTEREST_ICONS: Record<string, string> = {
  "Plastic Surgery": "💎",
  "Hair Transplant": "💇",
  "Dental Treatment": "🦷",
  "Hair Restoration": "💇",
  "Medical Aesthetic": "✨",
  "Other": "🏥",
};

export function DemoPatientPicker({ disabled, onLoaded, onCancel }: DemoPatientPickerProps) {
  const [patients, setPatients] = useState<DemoPatient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterInterest, setFilterInterest] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingPatientId, setLoadingPatientId] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetchPatients();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchPatients(searchQuery);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  async function fetchPatients(query?: string) {
    try {
      const response = await listDemoPatients(query);
      setPatients(response.patients);
      setLoaded(response.loaded);
    } catch {
      // Silently fail
    }
  }

  async function handleLoadPatient(patientId: string) {
    if (disabled || loading) return;
    setLoading(true);
    setLoadingPatientId(patientId);
    try {
      const response = await loadDemoPatient(patientId);
      onLoaded(response.messageId);
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false);
      setLoadingPatientId(undefined);
    }
  }

  const filtered = filterInterest
    ? patients.filter((p) => p.interest === filterInterest)
    : patients;

  const interests = [...new Set(patients.map((p) => p.interest))];

  if (!loaded) {
    return (
      <div className="demo-picker">
        <div className="demo-picker-header">
          <h3>📋 Load Real Patient Case</h3>
          <button type="button" onClick={onCancel}>✕</button>
        </div>
        <p className="empty-state">Patient data not loaded. Make sure Aggregated_Patient_Logs.csv is in data/esteworld-data/.</p>
      </div>
    );
  }

  return (
    <div className="demo-picker">
      <div className="demo-picker-header">
        <h3>📋 Load Real Patient Case</h3>
        <button type="button" onClick={onCancel}>✕</button>
      </div>

      <div className="demo-picker-filters">
        <input
          type="text"
          placeholder="Search patient name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="demo-search-input"
        />
        <div className="demo-interest-filters">
          <button
            type="button"
            className={!filterInterest ? "active" : ""}
            onClick={() => setFilterInterest("")}
          >
            All
          </button>
          {interests.map((interest) => (
            <button
              key={interest}
              type="button"
              className={filterInterest === interest ? "active" : ""}
              onClick={() => setFilterInterest(interest)}
            >
              {INTEREST_ICONS[interest] ?? "🏥"} {interest}
            </button>
          ))}
        </div>
      </div>

      <div className="demo-patient-list">
        {filtered.slice(0, 30).map((patient) => (
          <button
            key={patient.patientId}
            type="button"
            className="demo-patient-row"
            disabled={disabled || loading}
            onClick={() => handleLoadPatient(patient.patientId)}
          >
            <div className="demo-patient-main">
              <span className="demo-patient-icon">{INTEREST_ICONS[patient.interest] ?? "🏥"}</span>
              <div className="demo-patient-info">
                <strong>{patient.patientName}</strong>
                <span className="demo-patient-meta">
                  {patient.patientId} · {patient.interest} · {patient.messageCount} msgs
                  {patient.value > 0 ? ` · €${patient.value.toLocaleString("en-GB", { minimumFractionDigits: 0 })}` : ""}
                </span>
              </div>
            </div>
            {loadingPatientId === patient.patientId ? (
              <span className="demo-loading-badge">🤖 AI Analyzing...</span>
            ) : (
              <span className="demo-load-badge">Load →</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="empty-state">No patients found matching your criteria.</p>
      )}
    </div>
  );
}
