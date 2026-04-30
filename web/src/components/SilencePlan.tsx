import type { LeadAssessment } from "../api/client";

const fallbackPlan = [
  { day: 1, action: "Gentle check-in with clinical reassurance" },
  { day: 3, action: "Send treatment timeline and doctor review reminder" },
  { day: 7, action: "Create urgency around available dates" },
  { day: 14, action: "Re-engage with patient result story" }
];

export function SilencePlan({ assessment }: { assessment?: LeadAssessment }) {
  const plan = assessment?.silencePlan ?? fallbackPlan;

  return (
    <section className="split-section">
      <p className="section-label">If She Goes Silent</p>
      <div className="silence-list">
        {plan.map((step) => (
          <div className="silence-row" key={step.day}>
            <strong>Day {step.day}</strong>
            <span>{step.action}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
