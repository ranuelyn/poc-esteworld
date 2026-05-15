import { useEffect, useState } from "react";

interface CollectionInfo {
  exists: boolean;
  pointCount: number;
  vectorSize: number;
  status: string;
}

interface QdrantPoint {
  id: string;
  payload: {
    tenant_id: string;
    clinic_name: string;
    language: string;
    treatment: string;
    outcome: string;
    lead_temperature: string;
    dialogue_text: string;
    sales_notes: string;
  } | null;
  dialoguePreview: string;
}

const OUTCOME_COLORS: Record<string, string> = {
  successful: "#16a34a",
  neutral: "#d97706",
  lost: "#dc2626",
};

const TEMP_COLORS: Record<string, string> = {
  hot: "#dc2626",
  warm: "#f59e0b",
  cold: "#3b82f6",
};

export function QdrantViewer() {
  const [info, setInfo] = useState<CollectionInfo>();
  const [points, setPoints] = useState<QdrantPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void fetchInfo();
    void fetchPoints();
  }, []);

  async function fetchInfo() {
    try {
      const res = await fetch("/api/qdrant/info");
      setInfo(await res.json());
    } catch (e) {
      setError(String(e));
    }
  }

  async function fetchPoints() {
    setLoading(true);
    try {
      const res = await fetch("/api/qdrant/points?limit=100");
      const data = await res.json();
      setPoints(data.points ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCollection() {
    if (!confirm("Are you sure you want to delete the entire Qdrant collection? You will need to re-seed.")) return;
    try {
      await fetch("/api/qdrant/collection", { method: "DELETE" });
      setPoints([]);
      await fetchInfo();
    } catch (e) {
      setError(String(e));
    }
  }

  // Aggregate stats
  const treatments = new Map<string, number>();
  const outcomes = new Map<string, number>();
  const temperatures = new Map<string, number>();
  for (const p of points) {
    if (p.payload) {
      treatments.set(p.payload.treatment, (treatments.get(p.payload.treatment) ?? 0) + 1);
      outcomes.set(p.payload.outcome, (outcomes.get(p.payload.outcome) ?? 0) + 1);
      temperatures.set(p.payload.lead_temperature, (temperatures.get(p.payload.lead_temperature) ?? 0) + 1);
    }
  }

  return (
    <div className="qdrant-viewer">
      <div className="qdrant-header">
        <div>
          <p className="eyebrow">Vector Database</p>
          <h2>Qdrant RAG Viewer</h2>
        </div>
        <div className="qdrant-actions">
          <button type="button" onClick={() => { void fetchInfo(); void fetchPoints(); }}>
            ↻ Refresh
          </button>
          <button type="button" className="danger-btn" onClick={handleDeleteCollection}>
            🗑 Clear Collection
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Collection Info Card */}
      <div className="qdrant-info-grid">
        <div className="qdrant-stat-card">
          <span>Status</span>
          <strong className={info?.exists ? "hot" : ""}>
            {info ? (info.exists ? `✅ ${info.status}` : "❌ Not Created") : "Loading..."}
          </strong>
        </div>
        <div className="qdrant-stat-card">
          <span>Points</span>
          <strong>{info?.pointCount ?? "—"}</strong>
        </div>
        <div className="qdrant-stat-card">
          <span>Vector Size</span>
          <strong>{info?.vectorSize ?? "—"}</strong>
        </div>
        <div className="qdrant-stat-card">
          <span>Loaded</span>
          <strong>{points.length} shown</strong>
        </div>
      </div>

      {/* Aggregate Stats */}
      {points.length > 0 && (
        <div className="qdrant-aggregates">
          <div className="qdrant-agg-section">
            <h4>Treatments</h4>
            <div className="qdrant-tag-grid">
              {[...treatments.entries()].sort((a, b) => b[1] - a[1]).map(([treatment, count]) => (
                <span key={treatment} className="qdrant-tag">{treatment}: <strong>{count}</strong></span>
              ))}
            </div>
          </div>
          <div className="qdrant-agg-section">
            <h4>Outcomes</h4>
            <div className="qdrant-tag-grid">
              {[...outcomes.entries()].map(([outcome, count]) => (
                <span
                  key={outcome}
                  className="qdrant-tag"
                  style={{ borderColor: OUTCOME_COLORS[outcome] ?? "#999", color: OUTCOME_COLORS[outcome] ?? "#999" }}
                >
                  {outcome}: <strong>{count}</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="qdrant-agg-section">
            <h4>Temperatures</h4>
            <div className="qdrant-tag-grid">
              {[...temperatures.entries()].map(([temp, count]) => (
                <span
                  key={temp}
                  className="qdrant-tag"
                  style={{ borderColor: TEMP_COLORS[temp] ?? "#999", color: TEMP_COLORS[temp] ?? "#999" }}
                >
                  {temp}: <strong>{count}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Points List */}
      <div className="qdrant-points-header">
        <h3>Stored RAG Points ({points.length})</h3>
      </div>

      {loading ? (
        <p className="empty-state">Loading Qdrant data...</p>
      ) : points.length === 0 ? (
        <div className="qdrant-empty">
          <p className="empty-state">No points in Qdrant collection.</p>
          <p className="empty-state">Run <code>npm run seed:esteworld</code> to seed Esteworld patient data from CSV.</p>
        </div>
      ) : (
        <div className="qdrant-points-list">
          {points.map((point) => (
            <div key={point.id} className="qdrant-point-row">
              <button
                type="button"
                className="qdrant-point-summary"
                onClick={() => setExpandedId(expandedId === point.id ? undefined : point.id)}
              >
                <div className="qdrant-point-meta">
                  <span className="qdrant-point-id">{point.id.slice(0, 8)}...</span>
                  {point.payload && (
                    <>
                      <span className="qdrant-point-treatment">{point.payload.treatment}</span>
                      <span
                        className="qdrant-point-outcome"
                        style={{ color: OUTCOME_COLORS[point.payload.outcome] ?? "#666" }}
                      >
                        {point.payload.outcome}
                      </span>
                      <span
                        className="qdrant-point-temp"
                        style={{ color: TEMP_COLORS[point.payload.lead_temperature] ?? "#666" }}
                      >
                        {point.payload.lead_temperature}
                      </span>
                      <span className="qdrant-point-lang">{point.payload.language}</span>
                    </>
                  )}
                </div>
                <span className="qdrant-expand-icon">{expandedId === point.id ? "▼" : "▶"}</span>
              </button>

              {expandedId === point.id && point.payload && (
                <div className="qdrant-point-detail">
                  <div className="qdrant-detail-section">
                    <label>Tenant</label>
                    <p>{point.payload.tenant_id} — {point.payload.clinic_name}</p>
                  </div>
                  <div className="qdrant-detail-section">
                    <label>Sales Notes</label>
                    <p>{point.payload.sales_notes}</p>
                  </div>
                  <div className="qdrant-detail-section">
                    <label>Dialogue</label>
                    <pre className="qdrant-dialogue">{point.payload.dialogue_text}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
