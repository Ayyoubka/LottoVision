import { useState, useEffect } from 'react'
import './dashboard.css'

export default function PipelineStatusCard({ status, running, onRun, history }) {
  const [nextRun, setNextRun] = useState(() => getNextScheduledRun())

  // Tick once a minute to keep countdown fresh
  useEffect(() => {
    const id = setInterval(() => setNextRun(getNextScheduledRun()), 60_000)
    return () => clearInterval(id)
  }, [])

  const badge = deriveBadge(status, running)

  return (
    <div className="card db-card db-pipeline-card">
      <div className="db-card-header">
        <span className="db-card-title">Pipeline</span>
        {status?.ranAt && (
          <span className="db-card-meta">{formatTs(status.ranAt)}</span>
        )}
      </div>

      {/* Status badge */}
      <div className={`db-pipeline-status db-pipeline-${badge.cls}`}>
        <span className="db-pipeline-dot" />
        <span className="db-pipeline-label">{badge.label}</span>
        {status?.source && !running && (
          <span className={`db-pipeline-source-badge db-source-${status.source}`}>
            {status.source === 'scheduler' ? 'Auto' : 'Manual'}
          </span>
        )}
      </div>

      {/* Result summary — only when a run has completed */}
      {status && !status.error && status.drawId && (
        <div className="db-pipeline-summary">
          <div className="db-pipeline-row">
            <span className="db-pipeline-key">Draw</span>
            <span className="db-pipeline-val">#{status.drawId} · {status.drawDate ?? '—'}</span>
          </div>
          <div className="db-pipeline-row">
            <span className="db-pipeline-key">Import</span>
            <span className="db-pipeline-val">
              {status.drawInserted ? 'New ✓' : 'Already stored'}
            </span>
          </div>
          <div className="db-pipeline-row">
            <span className="db-pipeline-key">Ticket</span>
            <span className="db-pipeline-val">
              {!status.ticketFound
                ? 'Not found'
                : status.ticketAlreadyChecked
                  ? 'Already checked'
                  : status.ticketChecked
                    ? 'Checked ✓'
                    : 'Pending'}
              {status.ticketLinked ? ' (auto-linked)' : ''}
            </span>
          </div>
          {status.ticketFound && (
            <div className="db-pipeline-row">
              <span className="db-pipeline-key">Winnings</span>
              <span className={`db-pipeline-val ${status.winnings > 0 ? 'db-val-gold' : ''}`}>
                {status.winnings > 0 ? `+₪${status.winnings.toLocaleString()}` : '₪0'}
              </span>
            </div>
          )}
          {status.ticketFound && (
            <div className="db-pipeline-row">
              <span className="db-pipeline-key">Per member</span>
              <span className={`db-pipeline-val ${status.memberDelta >= 0 ? 'db-bal-pos' : 'db-bal-neg'}`}>
                {status.memberDelta >= 0 ? '+' : ''}₪{status.memberDelta}
              </span>
            </div>
          )}
          <div className="db-pipeline-row">
            <span className="db-pipeline-key">Settlement</span>
            <span className="db-pipeline-val">
              {status.settlementCreated
                ? 'Created ✓'
                : status.settlementSkipped
                  ? 'Already exists'
                  : '—'}
            </span>
          </div>
          {status.durationMs > 0 && (
            <div className="db-pipeline-row">
              <span className="db-pipeline-key">Duration</span>
              <span className="db-pipeline-val">{formatDuration(status.durationMs)}</span>
            </div>
          )}
        </div>
      )}

      {status?.error && (
        <p className="db-error-msg">Error: {status.error}</p>
      )}

      {/* Next scheduled run */}
      <div className="db-pipeline-next-run">
        <span className="db-pipeline-next-label">Next auto run</span>
        <span className="db-pipeline-next-val">{nextRun.label}</span>
      </div>

      {/* Recent run history dots */}
      {history && history.length > 0 && (
        <div className="db-pipeline-history-dots">
          {history.slice(0, 10).map((run, i) => (
            <span
              key={run.id ?? i}
              className={`db-pipeline-hist-dot ${run.errors?.length ? 'db-hist-err' : run.winnings > 0 ? 'db-hist-won' : 'db-hist-lost'}`}
              title={`${run.drawDate ?? '?'} · ${run.source ?? 'manual'} · ${run.winnings > 0 ? '+₪' + run.winnings : '₪0'}`}
            />
          ))}
        </div>
      )}

      {/* Run button — admin only */}
      {onRun && (
        <button
          className="db-pipeline-run-btn"
          onClick={onRun}
          disabled={running}
        >
          {running
            ? <span className="loading-dots">Running pipeline<span>…</span></span>
            : '▶ Run Weekly Pipeline'}
        </button>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function deriveBadge(status, running) {
  if (running) return { cls: 'running', label: 'Running…' }
  if (!status) return { cls: 'waiting', label: 'Waiting for draw' }
  if (status.error) return { cls: 'error', label: 'Error' }
  if (!status.ticketFound) return { cls: 'waiting', label: 'No active ticket' }
  if (!status.ticketChecked && !status.ticketAlreadyChecked) return { cls: 'waiting', label: 'Ticket not checked' }
  if (!status.settlementCreated && !status.settlementSkipped) return { cls: 'waiting', label: 'Settlement pending' }
  if (status.winnings > 0) return { cls: 'won', label: 'Won · Settlement complete' }
  return { cls: 'lost', label: 'Lost · Settlement complete' }
}

function formatTs(ts) {
  const ms = (ts?._seconds ?? ts?.seconds ?? 0) * 1000
  if (!ms) return ''
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Compute the next scheduled pipeline run: Tue/Sat 22:30 Israel time.
 * Returns { label, date }.
 */
function getNextScheduledRun() {
  const now     = new Date()
  const ilStr   = now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })
  const ilNow   = new Date(ilStr)

  // Draw days: 2 = Tuesday, 6 = Saturday
  const DAYS = [2, 6]

  let best = null
  for (const day of DAYS) {
    const candidate = new Date(ilNow)
    let diff = (day - ilNow.getDay() + 7) % 7
    // Same day but already past 22:30 → push to next week
    if (diff === 0 && (ilNow.getHours() > 22 || (ilNow.getHours() === 22 && ilNow.getMinutes() >= 30))) {
      diff = 7
    }
    candidate.setDate(ilNow.getDate() + diff)
    candidate.setHours(22, 30, 0, 0)
    if (!best || candidate < best) best = candidate
  }

  // Compute delta in ms using real now (not ilNow, which lost tz info)
  const deltaMs = best - ilNow
  const days    = Math.floor(deltaMs / 86_400_000)
  const hours   = Math.floor((deltaMs % 86_400_000) / 3_600_000)
  const mins    = Math.floor((deltaMs % 3_600_000) / 60_000)

  const dayName = best.toLocaleString('en-US', { weekday: 'short' })
  const time    = `22:30`

  let countdown
  if (days > 0)      countdown = `${dayName} ${time} · in ${days}d ${hours}h`
  else if (hours > 0) countdown = `${dayName} ${time} · in ${hours}h ${mins}m`
  else                countdown = `${dayName} ${time} · in ${mins}m`

  return { label: countdown, date: best }
}
