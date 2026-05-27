import './dashboard.css'

/**
 * Full-width banner at the top of the Dashboard.
 * Derives state from the active ticket status.
 *
 * States: PROCESSING → PENDING DRAW → WIN → LOSS
 */
export default function WeeklyResultBanner({ activeTicket, weeklyTicket, pipelineRunning }) {
  // Fall back to weeklyTicket so the banner reflects the active weekly definition
  // even when the corresponding tickets-collection entry is missing or unlinked.
  const { cls, label, sub } = deriveState(activeTicket ?? weeklyTicket, pipelineRunning)

  return (
    <div className={`weekly-banner weekly-banner-${cls}`}>
      <div className="weekly-banner-dot" />
      <div className="weekly-banner-text">
        <span className="weekly-banner-label">{label}</span>
        {sub && <span className="weekly-banner-sub">{sub}</span>}
      </div>
    </div>
  )
}

function deriveState(ticket, running) {
  if (running)
    return { cls: 'processing', label: 'PROCESSING', sub: 'Pipeline running…' }

  if (!ticket)
    return { cls: 'pending', label: 'NO ACTIVE TICKET', sub: 'Set a weekly ticket in Tools' }

  if (ticket.status === 'won')
    return { cls: 'win', label: 'WIN', sub: `₪${(ticket.winnings ?? 0).toLocaleString()} prize` }

  if (ticket.status === 'lost')
    return { cls: 'loss', label: 'LOSS', sub: 'Better luck next draw' }

  // pending
  return {
    cls:   'pending',
    label: 'PENDING DRAW',
    sub:   ticket.drawId ? `Draw #${ticket.drawId}` : 'Awaiting draw',
  }
}
