import type { LeadAssessment } from "../api/client";

export function NextBestActionCard({ assessment }: { assessment?: LeadAssessment }) {
  return (
    <section className="split-section">
      <p className="section-label">Next Best Action</p>
      <div className="nba-card">
        <div className="nba-icon">AI</div>
        <div>
          <h2>{assessment?.nextBestAction.title ?? "Waiting for Gemma analysis"}</h2>
          <p>
            {assessment?.nextBestAction.rationale ??
              "The conversation has been queued. Once the worker finishes RAG retrieval and model analysis, the recommendation will appear here."}
          </p>
          {assessment?.nextBestAction.evidence ? (
            <small>{assessment.nextBestAction.evidence}</small>
          ) : null}
        </div>
      </div>
    </section>
  );
}
