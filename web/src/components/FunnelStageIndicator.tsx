interface FunnelStageIndicatorProps {
  stage?: {
    stage: number;
    label: string;
    nextMilestone: string;
  };
}

const FUNNEL_LABELS = [
  "Lead",
  "Treatment Interest",
  "Photo Request",
  "Doctor Analysis",
  "Offer",
  "Follow-Up",
  "Date Scheduling",
  "Deposit",
  "Logistics",
  "Pre-Op",
  "Aftercare"
];

const STAGE_COLORS: Record<number, string> = {
  1: "#6366f1",
  2: "#818cf8",
  3: "#a78bfa",
  4: "#c084fc",
  5: "#e879f9",
  6: "#f472b6",
  7: "#fb923c",
  8: "#fbbf24",
  9: "#34d399",
  10: "#22d3ee",
  11: "#2dd4bf",
};

export function FunnelStageIndicator({ stage }: FunnelStageIndicatorProps) {
  if (!stage) return null;

  const stageNum = Math.max(1, Math.min(11, stage.stage));
  const progress = (stageNum / 11) * 100;
  const color = STAGE_COLORS[stageNum] ?? "#6366f1";

  return (
    <div className="funnel-stage-card">
      <div className="funnel-stage-header">
        <span className="funnel-stage-badge" style={{ backgroundColor: color }}>
          Stage {stageNum}
        </span>
        <span className="funnel-stage-label">{stage.label}</span>
      </div>
      <div className="funnel-progress-bar">
        <div
          className="funnel-progress-fill"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
        {FUNNEL_LABELS.map((label, index) => (
          <div
            key={label}
            className={`funnel-dot ${index + 1 <= stageNum ? "active" : ""} ${index + 1 === stageNum ? "current" : ""}`}
            style={{
              left: `${((index + 1) / 11) * 100}%`,
              borderColor: index + 1 <= stageNum ? color : undefined,
            }}
            title={label}
          />
        ))}
      </div>
      <div className="funnel-milestone">
        <span className="funnel-milestone-label">Next milestone:</span>
        <span className="funnel-milestone-text">{stage.nextMilestone}</span>
      </div>
    </div>
  );
}
