import type { AdminMetrics } from "../api/client";

export function AdminDashboard({ metrics }: { metrics?: AdminMetrics }) {
  if (!metrics) {
    return <div className="admin-page">Loading admin metrics...</div>;
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Team · Last 30 days</p>
          <h1>Admin Dashboard</h1>
        </div>
        <button type="button">Export</button>
      </header>

      <div className="metric-grid">
        <Metric label="Leads Answered" value={metrics.summary.leadsAnswered.toLocaleString()} />
        <Metric label="Deals Closed" value={metrics.summary.dealsClosed.toLocaleString()} />
        <Metric label="Avg Response Time" value={metrics.summary.avgResponseTime} />
        <Metric label="AI Usage" value={`${metrics.summary.aiUsage}%`} />
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card chart-card">
          <p className="eyebrow">Closed Deals Per Week</p>
          <h2>Team conversions</h2>
          <svg viewBox="0 0 600 180" role="img" aria-label="Team conversions chart">
            <polyline
              points={metrics.conversions
                .map((point, index) => `${40 + index * 80},${160 - point.manual * 1.6}`)
                .join(" ")}
              fill="none"
              stroke="#9ca3af"
              strokeWidth="2"
            />
            <polyline
              points={metrics.conversions
                .map((point, index) => `${40 + index * 80},${160 - point.withCopilot * 1.6}`)
                .join(" ")}
              fill="none"
              stroke="#0f172a"
              strokeWidth="3"
            />
          </svg>
        </section>

        <section className="dashboard-card">
          <p className="eyebrow">Top Reply Patterns</p>
          <h2>What's closing</h2>
          {metrics.replyPatterns.length === 0 ? (
            <EmptyState text="Reply seçtikçe ve boost kullandıkça burası dolacak." />
          ) : (
            metrics.replyPatterns.map((pattern) => (
              <div className="pattern-row" key={pattern.label}>
                <span>{pattern.label}</span>
                <div>
                  <b style={{ width: `${pattern.conversion}%` }} />
                </div>
                <strong>{pattern.conversion}%</strong>
              </div>
            ))
          )}
        </section>

        <section className="dashboard-card leaderboard">
          <p className="eyebrow">Leaderboard</p>
          <h2>Top performing agents</h2>
          {metrics.leaderboard.length === 0 ? (
            <EmptyState text="Satış danışmanı atanmış test case’i geldikçe sıralama oluşacak." />
          ) : (
            metrics.leaderboard.map((agent) => (
              <div className="agent-row" key={agent.agent}>
                <span className="avatar">{initials(agent.agent)}</span>
                <div>
                  <strong>{agent.agent}</strong>
                  <small>{agent.role}</small>
                </div>
                <span>{agent.deals}</span>
                <span>{agent.aiUse}%</span>
                <strong>{agent.revenue}</strong>
              </div>
            ))
          )}
        </section>

        <section className="dashboard-card">
          <p className="eyebrow">Closed Recently</p>
          <h2>New patients</h2>
          {metrics.closedRecently.length === 0 ? (
            <EmptyState text="Hot lead ve seçili reply oluşunca burada görünecek." />
          ) : (
            metrics.closedRecently.map((patient) => (
              <div className="closed-row" key={`${patient.patient}-${patient.timeAgo}`}>
                <div>
                  <strong>{patient.patient}</strong>
                  <small>
                    {patient.treatment} · {patient.agent}
                  </small>
                </div>
                <strong>{patient.value}</strong>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <small>Live test data</small>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}
