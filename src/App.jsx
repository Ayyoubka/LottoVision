import { useState }              from 'react'
import './App.css'
import { fetchLatestDraw, simulateTicket, fetchRecommendations } from './services/lottoApi'
import { saveTicket as saveTicketToServer, fetchMyTickets }       from './services/ticketApi.js'
import { useAuth }               from './contexts/AuthContext.jsx'
import { isFirebaseConfigured }  from './config/firebase.js'
import AuthScreen                from './screens/AuthScreen.jsx'
import PendingScreen             from './screens/PendingScreen.jsx'
import DashboardScreen           from './screens/DashboardScreen.jsx'
import HistoryScreen             from './screens/HistoryScreen.jsx'
import AdminTicketScreen         from './screens/AdminTicketScreen.jsx'
import AdminDrawImportScreen    from './screens/AdminDrawImportScreen.jsx'
import AdminDepositsScreen     from './screens/AdminDepositsScreen.jsx'
import { createWeeklyTicket }    from './services/ticketApi.js'

const TICKET_PRICE  = 6.00   // single combination, Pais official price
const MAX_MAIN      = 37
const MAX_STRONG    = 7
const MAIN_COUNT    = 6

// Official Pais Lotto prize structure — 8 classes.
// Pool prizes vary per draw; amounts are typical values from recent draws.
// Jackpot (Class 1) has a guaranteed minimum of ₪3,000,000 and rolls over.
// Source: pais.co.il/info/Prices.aspx + draw #3928 (24/05/2026).
const PRIZES = {
  // key        label                      odds           typical amount
  '6+s': { label: 'Class 1 · Jackpot',    odds: '1:16,273,488', amount: '₪3,000,000+'  },
  '6':   { label: 'Class 2',              odds: '1:2,712,248',  amount: '~₪500,000'    },
  '5+s': { label: 'Class 3',              odds: '1:87,492',     amount: '~₪5,300'      },
  '5':   { label: 'Class 4',              odds: '1:14,582',     amount: '~₪600'        },
  '4+s': { label: 'Class 5',              odds: '1:2,333',      amount: '~₪154'        },
  '4':   { label: 'Class 6',              odds: '1:389',        amount: '~₪47'         },
  '3+s': { label: 'Class 7',             odds: '1:181',        amount: '~₪39'         },
  '3':   { label: 'Class 8',              odds: '1:30',         amount: '~₪10'         },
}

function getPrize(mainCount, strongMatch) {
  const key = strongMatch ? `${mainCount}+s` : `${mainCount}`
  return PRIZES[key] ?? null
}

function drawRandomNums(count, max) {
  const set = new Set()
  while (set.size < count) set.add(Math.floor(Math.random() * max) + 1)
  return [...set].sort((a, b) => a - b)
}

export default function App() {
  // ── Auth guard ─────────────────────────────────────────────────────────
  const { user, profile, authLoading, logout } = useAuth()

  // All hooks must be declared before any conditional returns
  const [numbers, setNumbers]       = useState(Array(MAIN_COUNT).fill(''))
  const [strong, setStrong]         = useState('')
  const [result, setResult]         = useState(null)
  const [simResult, setSimResult]   = useState(null)
  const [recResult, setRecResult]   = useState(null)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [simLoading, setSimLoading] = useState(false)
  const [recLoading, setRecLoading] = useState(false)
  const [view, setView]             = useState('dashboard') // 'dashboard' | 'tools' | 'history'
  const [groupCost, setGroupCost]   = useState('70')
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklySaved,   setWeeklySaved]   = useState(false)
  const [mode, setMode]             = useState('real') // 'real' | 'random' | 'history' | 'picks' | 'tickets'

  const [ticketSaved, setTicketSaved]       = useState(false)
  const [saveLoading, setSaveLoading]       = useState(false)
  const [myTickets, setMyTickets]           = useState(null)
  const [ticketsLoading, setTicketsLoading] = useState(false)

  // ── Auth conditional renders ───────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: '#08080f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p style={{ color: '#ffd700', fontSize: '28px', fontWeight: 900, letterSpacing: '8px', margin: 0 }}>
          LOTO
        </p>
        <p style={{ color: '#4a4a6a', fontSize: '13px', margin: 0 }}>
          {isFirebaseConfigured ? 'Loading…' : 'Firebase not configured — check .env'}
        </p>
      </div>
    )
  }

  if (!user || !profile) return <AuthScreen />

  console.log('[Auth Debug]', { role: profile.role, approved: profile.approved, profile })

  const canAccess = profile.role === 'admin' || profile.approved === true
  if (!canAccess) return <PendingScreen />

  const updateNumber = (i, raw) => {
    const val  = raw.replace(/\D/g, '').slice(0, 2)
    const next = [...numbers]
    next[i]    = val
    setNumbers(next)
    setError('')
    setResult(null)
  }

  const updateStrong = (raw) => {
    setStrong(raw.replace(/\D/g, '').slice(0, 1))
    setError('')
    setResult(null)
  }

  const validate = () => {
    const nums = numbers.map(Number)
    if (numbers.some(n => n === ''))             return 'Please fill all 6 numbers'
    if (nums.some(n => n < 1 || n > MAX_MAIN))  return `Main numbers must be 1 – ${MAX_MAIN}`
    if (new Set(nums).size !== MAIN_COUNT)       return 'All 6 numbers must be unique'
    if (!strong)                                 return 'Please enter the strong number'
    const s = Number(strong)
    if (s < 1 || s > MAX_STRONG)                return `Strong number must be 1 – ${MAX_STRONG}`
    return null
  }

  const buildResult = (drawnMain, drawnStrong, drawMeta = null) => {
    const userNums      = numbers.map(Number)
    const matchedMain   = userNums.filter(n => drawnMain.includes(n))
    const matchedStrong = Number(strong) === drawnStrong
    const prize         = getPrize(matchedMain.length, matchedStrong)
    setResult({ drawnMain, drawnStrong, userNums, matchedMain, matchedStrong, prize, drawMeta })
  }

  const handleCheck = async () => {
    const err = validate()
    if (err) { setError(err); return }

    if (mode === 'random') {
      const drawnMain   = drawRandomNums(MAIN_COUNT, MAX_MAIN)
      const drawnStrong = Math.floor(Math.random() * MAX_STRONG) + 1
      buildResult(drawnMain, drawnStrong)
      return
    }

    if (mode === 'history') {
      setSimLoading(true)
      setError('')
      try {
        const data = await simulateTicket(numbers.map(Number), Number(strong))
        setSimResult(data)
      } catch (e) {
        setError(`Simulation failed: ${e.message}`)
      } finally {
        setSimLoading(false)
      }
      return
    }

    setLoading(true)
    setError('')
    try {
      const draw = await fetchLatestDraw()
      buildResult(draw.numbers, draw.strongNumber, { drawId: draw.drawId, date: draw.date })
    } catch (e) {
      setError(`Could not load real draw: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadTickets = async () => {
    if (ticketsLoading) return
    setTicketsLoading(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const { tickets: t } = await fetchMyTickets(token)
      setMyTickets(t)
    } catch (e) {
      setError(`Could not load tickets: ${e.message}`)
    } finally {
      setTicketsLoading(false)
    }
  }

  const handleSaveTicket = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setSaveLoading(true)
    setError('')
    try {
      const token  = await user.getIdToken()
      const drawId = result?.drawMeta?.drawId ?? null
      await saveTicketToServer(token, {
        numbers:      numbers.map(Number),
        strongNumber: Number(strong),
        drawId,
      })
      setTicketSaved(true)
      setTimeout(() => setTicketSaved(false), 3000)
    } catch (e) {
      setError(`Could not save ticket: ${e.message}`)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSetWeeklyTicket = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setWeeklyLoading(true)
    setError('')
    try {
      const token  = await user.getIdToken()
      const drawId = result?.drawMeta?.drawId ?? null
      await createWeeklyTicket(token, {
        numbers:      numbers.map(Number),
        strongNumber: Number(strong),
        drawId,
        cost:         groupCost ? Number(groupCost) : null,
      })
      setWeeklySaved(true)
      setTimeout(() => setWeeklySaved(false), 3000)
    } catch (e) {
      setError(`Could not set weekly ticket: ${e.message}`)
    } finally {
      setWeeklyLoading(false)
    }
  }

  const switchMode = (m) => {
    setMode(m)
    setResult(null)
    setSimResult(null)
    setRecResult(null)
    setError('')
    setTicketSaved(false)
    if (m === 'tickets' && myTickets === null) handleLoadTickets()
  }

  const handleReset = () => {
    setNumbers(Array(MAIN_COUNT).fill(''))
    setStrong('')
    setResult(null)
    setSimResult(null)
    setRecResult(null)
    setError('')
    setTicketSaved(false)
  }

  const handleGetPicks = async () => {
    setRecLoading(true)
    setError('')
    try {
      const data = await fetchRecommendations()
      setRecResult(data)
    } catch (e) {
      setError(`Could not generate picks: ${e.message}`)
    } finally {
      setRecLoading(false)
    }
  }

  const userNumsSorted = [...numbers.map(Number)].sort((a, b) => a - b)

  return (
    <div className="app">

      <header className="header">
        <button className="header-logout-btn" onClick={logout} title="Sign out">↩</button>
        <div className="header-icon">🎱</div>
        <h1 className="logo-text">LOTO</h1>
        <p className="tagline">{profile.fullName}</p>
      </header>

      <nav className="view-nav">
        <button className={`view-btn ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
        <button className={`view-btn ${view === 'tools'     ? 'active' : ''}`} onClick={() => setView('tools')}>Tools</button>
        <button className={`view-btn ${view === 'history'   ? 'active' : ''}`} onClick={() => setView('history')}>History</button>
        {profile.role === 'admin' && (
          <button className={`view-btn ${view === 'ticket'    ? 'active' : ''}`} onClick={() => setView('ticket')}>Ticket</button>
        )}
        {profile.role === 'admin' && (
          <button className={`view-btn ${view === 'import'    ? 'active' : ''}`} onClick={() => setView('import')}>Import</button>
        )}
        {profile.role === 'admin' && (
          <button className={`view-btn ${view === 'deposits'  ? 'active' : ''}`} onClick={() => setView('deposits')}>Deposits</button>
        )}
      </nav>

      {view === 'dashboard' && <DashboardScreen user={user} isAdmin={profile.role === 'admin'} />}
      {view === 'history'   && <HistoryScreen user={user} />}
      {view === 'ticket'    && profile.role === 'admin' && <AdminTicketScreen user={user} />}
      {view === 'import'    && profile.role === 'admin' && <AdminDrawImportScreen user={user} />}
      {view === 'deposits'  && profile.role === 'admin' && <AdminDepositsScreen   user={user} />}

      {view === 'tools' && <main className="content">

        {/* Mode toggle */}
        <div className="mode-toggle five-modes">
          <button className={`mode-btn ${mode === 'real'    ? 'active' : ''}`} onClick={() => switchMode('real')}>Real Draw</button>
          <button className={`mode-btn ${mode === 'random'  ? 'active' : ''}`} onClick={() => switchMode('random')}>Random</button>
          <button className={`mode-btn ${mode === 'history' ? 'active' : ''}`} onClick={() => switchMode('history')}>History</button>
          <button className={`mode-btn ${mode === 'picks'   ? 'active' : ''}`} onClick={() => switchMode('picks')}>Picks</button>
          <button className={`mode-btn ${mode === 'tickets' ? 'active' : ''}`} onClick={() => switchMode('tickets')}>My Tickets</button>
        </div>

        {mode === 'real'    && <div className="info-banner">Checks your numbers against the last official Pais draw</div>}
        {mode === 'history' && <div className="info-banner">Simulates your ticket across the last 100 official draws</div>}
        {mode === 'picks'   && <div className="info-banner">Smart picks generated from draw frequency &amp; pair statistics</div>}
        {mode === 'tickets' && <div className="info-banner">Your saved lotto tickets</div>}

        {/* Input card — hidden in Picks and Tickets modes */}
        {mode !== 'picks' && mode !== 'tickets' && <div className="card">
          <label className="section-label">
            Main Numbers
            <span className="range-badge">1 – {MAX_MAIN}</span>
          </label>
          <div className="main-grid">
            {numbers.map((val, i) => (
              <input
                key={i}
                className="ball-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                placeholder="–"
                value={val}
                onChange={e => updateNumber(i, e.target.value)}
              />
            ))}
          </div>

          <label className="section-label">
            Strong Number
            <span className="range-badge">1 – {MAX_STRONG}</span>
          </label>
          <div className="strong-row">
            <input
              className="ball-input strong-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              placeholder="–"
              value={strong}
              onChange={e => updateStrong(e.target.value)}
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="price-strip">
            <span className="price-label">Combination Price</span>
            <span className="price-value">₪{TICKET_PRICE.toFixed(2)}</span>
          </div>

          {/* Group weekly cost — used when setting as the active weekly ticket */}
          <div className="group-cost-row">
            <label className="group-cost-label">Group Weekly Cost</label>
            <div className="group-cost-input-wrap">
              <span className="group-cost-prefix">₪</span>
              <input
                className="group-cost-input"
                type="number"
                min="1"
                step="1"
                value={groupCost}
                onChange={e => setGroupCost(e.target.value)}
              />
            </div>
          </div>

          <button className="cta-btn" onClick={handleCheck} disabled={loading || simLoading}>
            {loading    ? <span className="loading-dots">Fetching draw<span>…</span></span>
           : simLoading ? <span className="loading-dots">Simulating<span>…</span></span>
           : mode === 'real'    ? 'Check Real Draw'
           : mode === 'history' ? 'Simulate 100 Draws'
           : 'Draw Numbers'}
          </button>

          <button
            className={`weekly-ticket-btn${weeklySaved ? ' saved' : ''}`}
            type="button"
            onClick={handleSetWeeklyTicket}
            disabled={weeklyLoading || weeklySaved}
          >
            {weeklyLoading
              ? <span className="loading-dots">Saving<span>…</span></span>
              : weeklySaved ? '✓ Set as Weekly Ticket!' : '★ Set as Weekly Ticket'}
          </button>

          <button
            className={`save-ticket-btn${ticketSaved ? ' saved' : ''}`}
            type="button"
            onClick={handleSaveTicket}
            disabled={saveLoading || ticketSaved}
          >
            {saveLoading
              ? <span className="loading-dots">Saving<span>…</span></span>
              : ticketSaved ? '✓ Saved!' : 'Save Reference Ticket'}
          </button>
        </div>}

        {/* Results card */}
        {result && (
          <div className={`card result-card ${result.prize ? 'winner' : ''}`}>

            {result.drawMeta && (
              <div className="draw-meta">
                <div className="draw-meta-item">
                  <span className="draw-meta-label">Draw</span>
                  <span className="draw-meta-value">#{result.drawMeta.drawId}</span>
                </div>
                <div className="draw-meta-divider" />
                <div className="draw-meta-item">
                  <span className="draw-meta-label">Date</span>
                  <span className="draw-meta-value">{result.drawMeta.date}</span>
                </div>
              </div>
            )}

            <div className="result-headline">
              {result.prize ? result.prize.label : '😔 No Win This Time'}
            </div>

            <label className="section-label">
              {result.drawMeta ? 'Winning Numbers' : 'Drawn Numbers'}
            </label>
            <div className="balls-row">
              {result.drawnMain.map(n => (
                <div
                  key={n}
                  className={`ball ${result.matchedMain.includes(n) ? 'matched-main' : 'unmatched'}`}
                >
                  {n}
                </div>
              ))}
              <div className="strong-ball-wrap">
                <div className={`ball strong-ball ${result.matchedStrong ? 'matched-strong' : 'unmatched'}`}>
                  {result.drawnStrong}
                </div>
                <span className="strong-ball-label">STRONG</span>
              </div>
            </div>

            <label className="section-label">Your Numbers</label>
            <div className="balls-row">
              {userNumsSorted.map(n => (
                <div
                  key={n}
                  className={`ball ${result.matchedMain.includes(n) ? 'matched-main' : 'unmatched'}`}
                >
                  {n}
                </div>
              ))}
              <div className="strong-ball-wrap">
                <div className={`ball strong-ball ${result.matchedStrong ? 'matched-strong' : 'unmatched'}`}>
                  {Number(strong)}
                </div>
                <span className="strong-ball-label">STRONG</span>
              </div>
            </div>

            <div className="match-row">
              <span className="match-count">{result.matchedMain.length}</span>
              <span className="match-text">main matched</span>
              {result.matchedStrong && <span className="strong-chip">+ strong</span>}
            </div>

            {result.prize && (
              <div className="winnings-box">
                <p className="winnings-label">{result.prize.label}</p>
                <p className="winnings-amount">{result.prize.amount}</p>
                <p className="winnings-odds">Odds {result.prize.odds}</p>
                {result.prize.label !== 'Class 1 · Jackpot' && (
                  <p className="winnings-pool">Pool prize · amount varies per draw</p>
                )}
              </div>
            )}

            <button className="reset-btn" onClick={handleReset}>
              Play Again
            </button>
          </div>
        )}

        {/* ── History simulation results ── */}
        {simResult && mode === 'history' && (() => {
          const { summary, draws: simDraws, ticket } = simResult
          const wins = simDraws.filter(d => d.tier)
            .sort((a, b) => b.prizeAmount - a.prizeAmount)
          const isProfit = summary.profitLoss >= 0

          return (
            <>
              {/* Summary card */}
              <div className="card sim-summary-card">
                <div className="sim-header">
                  <span className="sim-label">SIMULATED</span>
                  <span className="sim-draws-count">{summary.totalDraws} Draws</span>
                </div>

                <div className="sim-ticket-strip">
                  {ticket.numbers.map(n => (
                    <span key={n} className="sim-ticket-ball">{n}</span>
                  ))}
                  <span className="sim-ticket-strong">{ticket.strong}</span>
                </div>

                <div className="sim-stats-grid">
                  <div className="sim-stat">
                    <span className="sim-stat-label">INVESTED</span>
                    <span className="sim-stat-value">₪{summary.totalCost.toLocaleString()}</span>
                  </div>
                  <div className="sim-stat">
                    <span className="sim-stat-label">WINNINGS</span>
                    <span className="sim-stat-value sim-val-gold">₪{summary.totalWinnings.toLocaleString()}</span>
                  </div>
                  <div className="sim-stat">
                    <span className="sim-stat-label">WINS</span>
                    <span className="sim-stat-value">{summary.wins}</span>
                  </div>
                  <div className="sim-stat">
                    <span className="sim-stat-label">ROI</span>
                    <span className={`sim-stat-value ${isProfit ? 'sim-val-pos' : 'sim-val-neg'}`}>
                      {summary.roi > 0 ? '+' : ''}{summary.roi}%
                    </span>
                  </div>
                </div>

                <div className={`sim-profit-bar ${isProfit ? 'sim-profit' : 'sim-loss'}`}>
                  <span className="sim-profit-label">{isProfit ? 'PROFIT' : 'LOSS'}</span>
                  <span className="sim-profit-amount">
                    {isProfit ? '+' : '-'}₪{Math.abs(summary.profitLoss).toLocaleString()}
                  </span>
                </div>

                {summary.bestDraw && (
                  <div className="sim-best-win">
                    <span className="sim-best-tag">BEST WIN</span>
                    <div className="sim-best-content">
                      <span className="sim-best-prize">{summary.bestDraw.prizeLabel}</span>
                      <span className="sim-best-amount">₪{summary.bestDraw.prizeAmount.toLocaleString()}</span>
                    </div>
                    <span className="sim-best-meta">
                      Draw #{summary.bestDraw.drawId} · {summary.bestDraw.date}
                    </span>
                  </div>
                )}
              </div>

              {/* Winning draws */}
              {wins.length > 0 && (
                <div className="card">
                  <label className="section-label">
                    Winning Draws
                    <span className="wins-count-badge">{wins.length}</span>
                  </label>
                  {wins.map(d => (
                    <div key={d.drawId} className="win-draw-card">
                      <div className="win-draw-header">
                        <div className="win-draw-id-date">
                          <span className="win-draw-id">Draw #{d.drawId}</span>
                          <span className="win-draw-date">{d.date}</span>
                        </div>
                        <span className="win-prize-badge">{d.prizeLabel}</span>
                      </div>
                      <div className="win-draw-balls">
                        {d.drawNumbers.map(n => (
                          <span
                            key={n}
                            className={`win-ball ${d.matchedNumbers.includes(n) ? 'win-ball-hit' : 'win-ball-miss'}`}
                          >
                            {n}
                          </span>
                        ))}
                        <span className={`win-ball win-ball-strong ${d.matchedStrong ? 'win-ball-strong-hit' : 'win-ball-strong-miss'}`}>
                          {d.drawStrong}
                        </span>
                      </div>
                      <div className="win-draw-footer">
                        <span className="win-match-info">
                          {d.matchCount} matched{d.matchedStrong ? ' + strong' : ''}
                        </span>
                        <span className="win-amount">+₪{d.prizeAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* All draws compact list */}
              <div className="card">
                <label className="section-label">
                  All Draws
                  <span className="range-badge">{simDraws.length} checked</span>
                </label>
                <div className="draws-compact-list">
                  {simDraws.map(d => (
                    <div key={d.drawId} className={`draw-compact-row ${d.tier ? 'draw-compact-win' : ''}`}>
                      <span className="draw-compact-id">#{d.drawId}</span>
                      <span className="draw-compact-date">{d.date.slice(0, 5)}</span>
                      <span className="draw-compact-match">
                        {d.matchCount}{d.matchedStrong ? '+S' : ''}
                      </span>
                      {d.tier
                        ? <span className="draw-compact-tier">
                            {d.prizeLabel.replace('Class ', 'C')}
                          </span>
                        : <span className="draw-compact-none">—</span>
                      }
                    </div>
                  ))}
                </div>
              </div>

              <button className="reset-btn" onClick={handleReset}>
                Try Different Ticket
              </button>
            </>
          )
        })()}

        {/* ── Picks (recommendations) mode ── */}
        {mode === 'picks' && (
          <>
            {error && <div className="error-msg">{error}</div>}

            {!recResult && (
              <button className="cta-btn" onClick={handleGetPicks} disabled={recLoading}>
                {recLoading
                  ? <span className="loading-dots">Generating picks<span>…</span></span>
                  : 'Generate Smart Picks'}
              </button>
            )}

            {recResult && (() => {
              const GROUPS = [
                { key: 'smart',    label: 'Smart Picks',  cls: 'rec-smart',    desc: 'Pair-seeded · hot fill'       },
                { key: 'hot',      label: 'Hot Numbers',  cls: 'rec-hot',      desc: 'Most-drawn in last 100 draws' },
                { key: 'balanced', label: 'Balanced',     cls: 'rec-balanced', desc: 'Frequency + structure rules'  },
                { key: 'risky',    label: 'Contrarian',   cls: 'rec-risky',    desc: 'Least-drawn · high variance'  },
              ]

              return (
                <>
                  {GROUPS.map(({ key, label, cls, desc }) => (
                    <div key={key} className={`rec-group ${cls}`}>
                      <div className="rec-group-header">
                        <div className="rec-group-title">
                          <span className="rec-group-label">{label}</span>
                          <span className="rec-group-desc">{desc}</span>
                        </div>
                        <span className="rec-group-badge">3 tickets</span>
                      </div>

                      {recResult[key].map((t, i) => (
                        <div key={i} className="rec-ticket-card">
                          <div className="rec-ticket-meta">
                            <span className="rec-ticket-num">#{i + 1}</span>
                            <span className="rec-ticket-explanation">{t.explanation}</span>
                          </div>
                          <div className="rec-balls-row">
                            {t.numbers.map(n => (
                              <span key={n} className="rec-ball">{n}</span>
                            ))}
                            <div className="rec-strong-wrap">
                              <span className="rec-strong-ball">{t.strongNumber}</span>
                              <span className="rec-strong-label">STR</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                  <button className="reset-btn" onClick={() => setRecResult(null)}>
                    Regenerate Picks
                  </button>
                </>
              )
            })()}
          </>
        )}

        {/* ── My Tickets mode ── */}
        {mode === 'tickets' && (
          <>
            {ticketsLoading && (
              <div className="info-banner">
                <span className="loading-dots">Loading tickets<span>…</span></span>
              </div>
            )}

            {!ticketsLoading && myTickets !== null && myTickets.length === 0 && (
              <div className="card tickets-empty-card">
                <p className="tickets-empty-icon">🎫</p>
                <p className="tickets-empty-title">No saved tickets yet</p>
                <p className="tickets-empty-sub">Enter numbers in any mode and tap Save Ticket</p>
              </div>
            )}

            {myTickets !== null && myTickets.length > 0 && (
              <div className="card">
                <div className="tickets-list-header">
                  <label className="section-label">
                    My Tickets
                    <span className="wins-count-badge">{myTickets.length}</span>
                  </label>
                  <button className="refresh-tickets-btn" onClick={handleLoadTickets} disabled={ticketsLoading}>↺</button>
                </div>
                {myTickets.map(t => (
                  <div key={t.id} className="my-ticket-card">
                    <div className="my-ticket-balls">
                      {t.numbers.map(n => (
                        <span key={n} className="my-ticket-ball">{n}</span>
                      ))}
                      <div className="my-ticket-strong-wrap">
                        <span className="my-ticket-strong">{t.strongNumber}</span>
                        <span className="my-ticket-strong-lbl">STR</span>
                      </div>
                    </div>
                    <div className="my-ticket-footer">
                      <span className="my-ticket-date">{formatTimestamp(t.createdAt)}</span>
                      <span className={`my-ticket-status status-${t.status}`}>{t.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {myTickets !== null && (
              <button className="reset-btn" onClick={handleLoadTickets} disabled={ticketsLoading}>
                {ticketsLoading ? 'Refreshing…' : 'Refresh Tickets'}
              </button>
            )}
          </>
        )}

      </main>}

    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return ''
  const ms = (ts._seconds ?? ts.seconds ?? 0) * 1000
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
