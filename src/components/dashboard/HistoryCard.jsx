import './dashboard.css'
import { formatTimestamp } from '../../utils/format.js'

export default function HistoryCard({ tickets }) {
  return (
    <div className="card db-card">
      <div className="db-card-header">
        <span className="db-card-title">History</span>
        {tickets.length > 0 && <span className="db-card-meta">{tickets.length} checked</span>}
      </div>

      {tickets.length === 0 && (
        <p className="db-empty-msg">No checked tickets yet</p>
      )}

      {tickets.length > 0 && (
        <div className="db-history-list">
          {tickets.map(t => (
            <div
              key={t.id}
              className={`db-history-row${t.status === 'won' ? ' db-history-won' : ''}`}
            >
              <div className="db-history-left">
                <span className="db-history-draw">
                  {t.drawId ? `Draw #${t.drawId}` : formatTimestamp(t.createdAt)}
                </span>
                {t.drawDate && <span className="db-history-date">{t.drawDate}</span>}
              </div>
              <div className="db-history-right">
                {t.tier && (
                  <span className="db-history-tier">
                    {(t.prizeLabel ?? t.tier).replace('Class ', 'C')}
                  </span>
                )}
                <span className={`my-ticket-status status-${t.status}`}>{t.status}</span>
                {t.status === 'won' && (
                  <span className="db-history-winnings">+₪{t.winnings.toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
