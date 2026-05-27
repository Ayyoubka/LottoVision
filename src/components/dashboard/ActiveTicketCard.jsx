import './dashboard.css'

export default function ActiveTicketCard({ ticket, weeklyTicket, loading }) {
  if (loading) {
    return (
      <div className="card db-card">
        <div className="db-card-header">
          <span className="db-card-title">Weekly Ticket</span>
        </div>
        <p className="db-loading-msg">Loading…</p>
      </div>
    )
  }

  // Show notes/cost from weekly_tickets if available, fall back to tickets doc
  const cost   = weeklyTicket?.cost  ?? ticket?.cost  ?? 70
  const notes  = weeklyTicket?.notes ?? null
  const fromDraw = weeklyTicket?.effectiveFromDrawId ?? null

  return (
    <div className={`card db-card${ticket?.status === 'won' ? ' winner' : ''}`}>
      <div className="db-card-header">
        <span className="db-card-title">Weekly Ticket</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ticket?.drawId && <span className="db-card-meta">Draw #{ticket.drawId}</span>}
          {ticket && (
            <span className={`weekly-chip weekly-chip-${chipClass(ticket.status)}`}>
              {ticket.status?.toUpperCase() ?? 'PENDING'}
            </span>
          )}
        </div>
      </div>

      {!ticket && !weeklyTicket && (
        <p className="db-empty-msg">No active ticket — create one in the Ticket tab</p>
      )}

      {/* Show numbers from ticket (draw instance) or from weeklyTicket definition */}
      {(ticket || weeklyTicket) && (
        <>
          <div className="balls-row">
            {(ticket ?? weeklyTicket).numbers.map(n => (
              <div
                key={n}
                className={`ball${ticket?.matchedCount > 0 && ticket?.checked ? ' matched-main' : ''}`}
              >
                {n}
              </div>
            ))}
            <div className="strong-ball-wrap">
              <div className={`ball strong-ball${ticket?.matchedStrong && ticket?.checked ? ' matched-strong' : ''}`}>
                {(ticket ?? weeklyTicket).strongNumber}
              </div>
              <span className="strong-ball-label">STRONG</span>
            </div>
          </div>

          <div className="db-ticket-footer">
            <span className="db-ticket-cost">₪{cost} group cost</span>
            {ticket?.status === 'won' && (
              <span className="db-settle-prize" style={{ fontWeight: 800, fontSize: 15 }}>
                +₪{(ticket.winnings ?? 0).toLocaleString()}
              </span>
            )}
          </div>

          {/* Notes from weekly ticket definition */}
          {notes && (
            <p className="db-ticket-notes">{notes}</p>
          )}

          {/* Effective from draw — shown when ticket isn't yet linked to a draw instance */}
          {fromDraw && !ticket?.drawId && (
            <p className="db-ticket-from-draw">From draw #{fromDraw}</p>
          )}
        </>
      )}
    </div>
  )
}

function chipClass(status) {
  if (status === 'won')  return 'win'
  if (status === 'lost') return 'loss'
  return 'pending'
}
