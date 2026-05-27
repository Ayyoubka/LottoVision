import './dashboard.css'

export default function SettlementCard({ settlement, loading }) {
  if (loading) {
    return (
      <div className="card db-card">
        <div className="db-card-header">
          <span className="db-card-title">Latest Settlement</span>
        </div>
        <p className="db-loading-msg">Loading…</p>
      </div>
    )
  }

  if (!settlement) {
    return (
      <div className="card db-card">
        <div className="db-card-header">
          <span className="db-card-title">Latest Settlement</span>
        </div>
        <p className="db-empty-msg">No settlements yet — check a ticket to run the first settlement</p>
      </div>
    )
  }

  const won     = settlement.winnings > 0
  const profit  = settlement.netResult >= 0
  const delta   = settlement.memberResults?.[0]?.delta ?? 0

  return (
    <div className={`card db-card${won ? ' winner' : ''}`}>
      <div className="db-card-header">
        <span className="db-card-title">Latest Settlement</span>
        <span className="db-card-meta">Draw #{settlement.drawId}</span>
      </div>

      {/* Result banner */}
      <div className={`db-settle-banner ${profit ? 'db-settle-profit' : 'db-settle-loss'}`}>
        <span className="db-settle-result-label">{profit ? 'PROFIT' : 'LOSS'}</span>
        <span className="db-settle-net">
          {profit ? '+' : ''}₪{settlement.netResult.toLocaleString()}
        </span>
      </div>

      {/* Cost / winnings row */}
      <div className="db-settle-stats">
        <div className="db-settle-stat">
          <span className="db-settle-stat-label">Ticket Cost</span>
          <span className="db-settle-stat-value db-settle-cost">-₪{settlement.ticketCost}</span>
        </div>
        <div className="db-settle-stat">
          <span className="db-settle-stat-label">Prize</span>
          <span className={`db-settle-stat-value ${won ? 'db-settle-prize' : ''}`}>
            {won ? `+₪${settlement.winnings.toLocaleString()}` : '₪0'}
          </span>
        </div>
        <div className="db-settle-stat">
          <span className="db-settle-stat-label">Per Member</span>
          <span className={`db-settle-stat-value ${delta >= 0 ? 'db-bal-pos' : 'db-bal-neg'}`}>
            {delta >= 0 ? '+' : ''}₪{delta}
          </span>
        </div>
      </div>
    </div>
  )
}
