import './dashboard.css'

export default function LastCheckCard({ ticket }) {
  return (
    <div className={`card db-card${ticket?.status === 'won' ? ' winner' : ''}`}>
      <div className="db-card-header">
        <span className="db-card-title">Last Check</span>
        {ticket?.drawDate && <span className="db-card-meta">{ticket.drawDate}</span>}
      </div>

      {!ticket && (
        <p className="db-empty-msg">No checked tickets yet</p>
      )}

      {ticket && (
        <>
          <div className="db-check-result">
            <span className="db-check-match">{ticket.matchedCount}</span>
            <span className="db-check-match-label">
              main{ticket.matchedStrong ? ' + strong' : ''}
            </span>
            {ticket.tier && (
              <span className="db-check-tier">{ticket.prizeLabel}</span>
            )}
          </div>
          <div className="db-check-footer">
            <span className={`my-ticket-status status-${ticket.status}`}>{ticket.status}</span>
            <span className={`db-check-winnings${ticket.status === 'won' ? ' db-winnings-won' : ''}`}>
              {ticket.status === 'won' ? `+₪${ticket.winnings.toLocaleString()}` : '₪0'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
