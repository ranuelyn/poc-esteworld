import type { LeadAssessment } from "../api/client";

const fallbackBoosts = [
  { type: "shorter", label: "Shorter" },
  { type: "more_trustworthy", label: "More trustworthy" },
  { type: "more_persuasive", label: "More persuasive" },
  { type: "ask_for_photos", label: "Ask for photos" },
  { type: "ask_travel_dates", label: "Ask travel dates" },
  { type: "ask_for_deposit", label: "Ask for deposit" },
  { type: "confirm_flights", label: "Confirm flights" },
  { type: "make_softer", label: "Make softer" }
];

export function SalesBoostPanel({
  assessment,
  onBoost
}: {
  assessment?: LeadAssessment;
  onBoost: (boostType: string) => void;
}) {
  const boosts = assessment?.salesBoosts ?? fallbackBoosts;

  return (
    <section className="split-section">
      <p className="section-label">Sales Boost</p>
      <div className="boost-grid">
        {boosts.map((boost) => (
          <button
            className="boost-button"
            disabled={!assessment}
            key={boost.type}
            type="button"
            onClick={() => onBoost(boost.type)}
          >
            {boost.label}
          </button>
        ))}
      </div>
    </section>
  );
}
