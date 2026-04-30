import type { CopilotCase, LeadAssessment } from "../api/client";

export function MessageAnalysisCards({
  assessment,
  caseItem
}: {
  assessment?: LeadAssessment;
  caseItem?: CopilotCase;
}) {
  const analysis = assessment?.analysis;

  return (
    <section>
      <div className="analysis-title-row">
        <p className="section-label">Message Analysis</p>
        <span className="duration-pill">
          {caseItem?.status === "pending"
            ? "Analysing..."
            : caseItem?.status === "failed"
              ? "Failed"
            : caseItem?.aiDurationMs
              ? `${Math.round(caseItem.aiDurationMs / 1000)} sec`
              : "0 sec"}
        </span>
      </div>
      <div className="analysis-grid">
        <AnalysisCard label="Language" value={analysis?.language ?? (caseItem?.status === "failed" ? "Failed" : "Waiting")} />
        <AnalysisCard label="Intent" value={analysis?.intent ?? (caseItem?.status === "failed" ? "AI error" : "Pending")} accent />
        <AnalysisCard label="Treatment" value={analysis?.treatment ?? "Unknown"} />
        <AnalysisCard
          label="Lead Temp."
          value={
            analysis
              ? `${capitalize(analysis.leadTemperature)} · ${analysis.leadScore}%`
              : "Analyzing"
          }
          hot={analysis?.leadTemperature === "hot"}
        />
      </div>
    </section>
  );
}

function AnalysisCard({
  label,
  value,
  accent,
  hot
}: {
  label: string;
  value: string;
  accent?: boolean;
  hot?: boolean;
}) {
  return (
    <div className="analysis-card">
      <span>{label}</span>
      <strong className={accent ? "accent" : hot ? "hot" : undefined}>{value}</strong>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
