import './dashboard.css'

/**
 * Shows the last pipeline run status and a "Run Pipeline" button.
 *
 * Status derivation:
 *   no run yet          → Waiting for draw
 *   error               → Error
 *   no ticket found     → No active ticket
 *   checked + won       → Won
 *   checked + lost      → Lost
 *   settlement complete → Settlement complete
 */
export default function PipelineStatusCard({ status, running, onRun }) {
  const badge = deriveBadge(status, running)

  return (
    <div className="card db-card db-pipeline-card">
      <div className="db-card-header">
        <span className="db-card-title">Pipeline</span>
        {status?.ranAt && (
          <span className="db-card-meta">{formatRanAt(status.ranAt)}</span>
        )}
      </div>

      {/* Status badge */}
      <div className={`db-pipeline-status db-pipeline-${badge.cls}`}>
        <span className="db-pipeline-dot" />
        <span className="db-pipeline-label">{badge.label}</span>
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
        </div>
      )}

      {status?.error && (
        <p className="db-error-msg">Error: {status.error}</p>
      )}

      {/* Run button */}
      <button
        className="db-pipeline-run-btn"
        onClick={onRun}
        disabled={running}
      >
        {running
          ? <span className="loading-dots">Running pipeline<span>…</span></span>
          : '▶ Run Weekly Pipeline'}
      </button>
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

function formatRanAt(ranAt) {
  const ms = (ranAt?._seconds ?? ranAt?.seconds ?? 0) * 1000
  if (!ms) return ''
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
