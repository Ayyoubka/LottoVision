import './dashboard.css'

export default function LatestDrawCard({ draw, loading, error }) {
  return (
    <div className="card db-card">
      <div className="db-card-header">
        <span className="db-card-title">Latest Draw</span>
        {draw && <span className="db-card-meta">#{draw.drawId} · {draw.date}</span>}
      </div>

      {loading && <p className="db-loading-msg">Loading draw…</p>}
      {error   && <p className="db-error-msg">{error}</p>}

      {draw && (
        <div className="balls-row">
          {draw.numbers.map(n => (
            <div key={n} className="ball">{n}</div>
          ))}
          <div className="strong-ball-wrap">
            <div className="ball strong-ball">{draw.strongNumber}</div>
            <span className="strong-ball-label">STRONG</span>
          </div>
        </div>
      )}
    </div>
  )
}
