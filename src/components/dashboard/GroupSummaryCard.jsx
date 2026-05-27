import './dashboard.css'

export default function GroupSummaryCard({ members, loading }) {
  if (loading || !members || members.length === 0) return null

  const totalPaid  = members.reduce((s, m) => s + (m.totalPaid ?? 0), 0)
  const totalWon   = members.reduce((s, m) => s + (m.totalWon  ?? 0), 0)
  const netResult  = totalWon - totalPaid
  const isProfit   = netResult >= 0

  return (
    <div className="card db-card">
      <div className="db-card-header">
        <span className="db-card-title">Group Summary</span>
        <span className="db-card-meta">All time</span>
      </div>

      <div className="db-summary-grid">
        <div className="db-summary-stat">
          <span className="db-summary-label">Total Invested</span>
          <span className="db-summary-value db-settle-cost">₪{totalPaid.toLocaleString()}</span>
        </div>
        <div className="db-summary-stat">
          <span className="db-summary-label">Total Won</span>
          <span className={`db-summary-value ${totalWon > 0 ? 'db-settle-prize' : ''}`}>
            ₪{totalWon.toLocaleString()}
          </span>
        </div>
        <div className="db-summary-stat db-summary-wide">
          <span className="db-summary-label">Net Result</span>
          <span className={`db-summary-value db-summary-net ${isProfit ? 'db-bal-pos' : 'db-bal-neg'}`}>
            {isProfit ? '+' : ''}₪{netResult.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
