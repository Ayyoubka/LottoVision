import { useState, useEffect } from 'react'
import { fetchSettlements }  from '../services/settlementApi.js'
import '../components/dashboard/dashboard.css'

export default function HistoryScreen({ user }) {
  const [settlements, setSettlements] = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const { settlements: data } = await fetchSettlements(token)
      setSettlements(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="db-screen">
      <div className="db-refresh-row">
        <button className="db-refresh-btn" onClick={load} disabled={loading}>
          {loading ? '…' : '↺ Refresh'}
        </button>
      </div>

      <div className="card db-card">
        <div className="db-card-header">
          <span className="db-card-title">Settlement History</span>
          {settlements && <span className="db-card-meta">{settlements.length} records</span>}
        </div>

        {loading && <p className="db-loading-msg">Loading history…</p>}
        {error   && <p className="db-error-msg">{error}</p>}

        {!loading && settlements?.length === 0 && (
          <p className="db-empty-msg">No settlements yet — run the pipeline after a draw</p>
        )}

        {settlements && settlements.length > 0 && (
          <div className="db-history-full-list">
            {settlements.map(s => (
              <SettlementRow key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SettlementRow({ s }) {
  const [open, setOpen] = useState(false)
  const won    = s.winnings > 0
  const profit = s.netResult >= 0
  const delta  = s.memberResults?.[0]?.delta ?? 0
  const ranAt  = formatTs(s.checkedAt)

  return (
    <div className={`db-history-full-row${won ? ' db-history-won' : ''}`}>
      <button className="db-history-full-header" onClick={() => setOpen(v => !v)}>
        <div className="db-history-full-left">
          <span className="db-history-draw">Draw #{s.drawId}</span>
          <span className="db-history-date">{ranAt}</span>
        </div>
        <div className="db-history-full-right">
          <span className={`weekly-chip weekly-chip-${won ? 'win' : 'loss'}`}>
            {won ? 'WIN' : 'LOSS'}
          </span>
          <span className={`db-member-balance ${profit ? 'db-bal-pos' : 'db-bal-neg'}`}>
            {profit ? '+' : ''}₪{s.netResult}
          </span>
          <span className="db-history-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="db-history-full-body">
          <div className="db-settle-stats db-history-stats">
            <div className="db-settle-stat">
              <span className="db-settle-stat-label">Cost</span>
              <span className="db-settle-stat-value db-settle-cost">₪{s.ticketCost}</span>
            </div>
            <div className="db-settle-stat">
              <span className="db-settle-stat-label">Prize</span>
              <span className={`db-settle-stat-value ${won ? 'db-settle-prize' : ''}`}>
                {won ? `₪${s.winnings.toLocaleString()}` : '₪0'}
              </span>
            </div>
            <div className="db-settle-stat">
              <span className="db-settle-stat-label">Per Member</span>
              <span className={`db-settle-stat-value ${delta >= 0 ? 'db-bal-pos' : 'db-bal-neg'}`}>
                {delta >= 0 ? '+' : ''}₪{delta}
              </span>
            </div>
          </div>

          {/* Winning lines breakdown */}
          {s.linesBreakdown?.length > 0 && (
            <div className="db-history-breakdown">
              <p className="db-breakdown-title">Winning Lines</p>
              {s.linesBreakdown.map((line, i) => (
                <div key={i} className="db-breakdown-row">
                  <div className="db-breakdown-left">
                    <span className="db-breakdown-line">Line {line.lineNumber}</span>
                    <span className="db-breakdown-detail">
                      {line.matchedCount} matched{line.matchedStrong ? ' + strong' : ''}
                    </span>
                    {line.prizeLabel && (
                      <span className="db-breakdown-class">{line.prizeLabel}</span>
                    )}
                  </div>
                  <span className="db-breakdown-prize">+₪{line.winnings.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {s.memberResults?.length > 0 && (
            <div className="db-history-members">
              {s.memberResults.map(m => (
                <div key={m.memberId ?? m.name} className="db-member-row">
                  <span className="db-member-name">{m.name}</span>
                  <div className="db-member-right">
                    <span className={`db-member-balance ${m.delta >= 0 ? 'db-bal-pos' : 'db-bal-neg'}`}>
                      {m.delta >= 0 ? '+' : ''}₪{m.delta}
                    </span>
                    <span className="db-history-date">→ ₪{m.balanceAfter}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatTs(ts) {
  if (!ts) return ''
  const ms = (ts._seconds ?? ts.seconds ?? 0) * 1000
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
