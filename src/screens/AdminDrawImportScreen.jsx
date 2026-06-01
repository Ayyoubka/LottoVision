import { useState } from 'react'
import { importDraw } from '../services/adminApi.js'
import '../components/dashboard/dashboard.css'
import './AdminTicketScreen.css'

const PRIZE_TIERS = [
  { key: '3',   label: '3 matches' },
  { key: '3+s', label: '3 + Strong' },
  { key: '4',   label: '4 matches' },
  { key: '4+s', label: '4 + Strong' },
  { key: '5',   label: '5 matches' },
  { key: '5+s', label: '5 + Strong' },
  { key: '6',   label: '6 matches' },
  { key: '6+s', label: '6 + Strong (Jackpot)' },
]

const BLANK_PRIZES = Object.fromEntries(PRIZE_TIERS.map(t => [t.key, '']))

const BLANK_FORM = {
  drawId:       '',
  date:         '',
  numbers:      Array(6).fill(''),
  strongNumber: '',
  prizes:       { ...BLANK_PRIZES },
}

export default function AdminDrawImportScreen({ user }) {
  const [form,    setForm]    = useState(BLANK_FORM)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)

  const setNum = (i, raw) => {
    const val  = raw.replace(/\D/g, '').slice(0, 2)
    const next = [...form.numbers]
    next[i]    = val
    setForm(f => ({ ...f, numbers: next }))
  }

  const setPrize = (key, raw) => {
    const val = raw.replace(/\D/g, '')
    setForm(f => ({ ...f, prizes: { ...f.prizes, [key]: val } }))
  }

  const validate = () => {
    const errs = []
    const id = Number(form.drawId)
    if (!Number.isInteger(id) || id < 1) errs.push('Draw ID must be a positive integer')

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(form.date)) errs.push('Date must be DD/MM/YYYY')

    const nums = form.numbers.map(n => n === '' ? NaN : Number(n))
    if (nums.some(isNaN))                 errs.push('Fill all 6 winning numbers')
    else if (nums.some(n => n < 1 || n > 37)) errs.push('Numbers must be 1–37')
    else if (new Set(nums).size !== 6)    errs.push('All 6 numbers must be unique')

    const s = Number(form.strongNumber)
    if (!form.strongNumber || isNaN(s) || s < 1 || s > 7) errs.push('Strong number must be 1–7')

    for (const { key, label } of PRIZE_TIERS) {
      const v = form.prizes[key]
      if (v === '' || v === null || v === undefined) { errs.push(`${label}: enter a prize amount (0 if no prize)`); continue }
      if (!/^\d+$/.test(String(v))) errs.push(`${label}: must be a non-negative integer`)
    }

    return errs
  }

  const handleSubmit = async () => {
    setError(null)
    setResult(null)

    const errs = validate()
    if (errs.length) { setError(errs.join('\n')); return }

    setLoading(true)
    try {
      const token  = await user.getIdToken()
      const prizes = Object.fromEntries(
        PRIZE_TIERS.map(({ key }) => [key, Number(form.prizes[key])])
      )
      const data = await importDraw(token, {
        drawId:       Number(form.drawId),
        date:         form.date.trim(),
        numbers:      form.numbers.map(Number),
        strongNumber: Number(form.strongNumber),
        prizes,
      })
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setForm(BLANK_FORM)
    setError(null)
    setResult(null)
  }

  return (
    <div className="adm-screen">

      <div className="adm-header">
        <span className="adm-title">Import Draw Result</span>
      </div>

      {result ? (
        <ImportResult result={result} onReset={handleReset} />
      ) : (
        <div className="card adm-card">

          {error && (
            <pre className="adm-error" style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>
          )}

          {/* Draw info */}
          <label className="adm-form-label">Draw ID</label>
          <input className="adm-cost-input" type="number" min="1" placeholder="e.g. 3930"
            value={form.drawId}
            onChange={e => setForm(f => ({ ...f, drawId: e.target.value }))} />

          <label className="adm-form-label">Date <span className="adm-range">(DD/MM/YYYY)</span></label>
          <input className="adm-cost-input" type="text" placeholder="29/03/2025"
            maxLength={10} value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />

          {/* Winning numbers */}
          <label className="adm-form-label">Winning Numbers <span className="adm-range">(1–37)</span></label>
          <div className="adm-nums-grid">
            {form.numbers.map((val, i) => (
              <input key={i} className="adm-num-input" type="text" inputMode="numeric"
                maxLength={2} placeholder="–" value={val}
                onChange={e => setNum(i, e.target.value)} />
            ))}
          </div>

          <label className="adm-form-label">Strong Number <span className="adm-range">(1–7)</span></label>
          <input className="adm-num-input adm-strong-input" type="text" inputMode="numeric"
            maxLength={1} placeholder="–" value={form.strongNumber}
            onChange={e => setForm(f => ({ ...f, strongNumber: e.target.value.replace(/\D/g, '').slice(0, 1) }))} />

          {/* Prize table */}
          <label className="adm-form-label" style={{ marginTop: '16px' }}>
            Prize Table <span className="adm-range">(ILS — enter 0 if no prize for that tier)</span>
          </label>
          <div className="adm-prize-grid">
            {PRIZE_TIERS.map(({ key, label }) => (
              <div key={key} className="adm-prize-row">
                <span className="adm-prize-label">{label}</span>
                <div className="adm-cost-row">
                  <span className="adm-cost-prefix">₪</span>
                  <input className="adm-cost-input" type="text" inputMode="numeric"
                    placeholder="0" value={form.prizes[key]}
                    onChange={e => setPrize(key, e.target.value)} />
                </div>
              </div>
            ))}
          </div>

          <button className="adm-btn adm-btn-create" onClick={handleSubmit} disabled={loading}
            style={{ marginTop: '20px', width: '100%' }}>
            {loading ? 'Importing…' : '⚡ Import & Run Settlement'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Result display ─────────────────────────────────────────────────────────

function ImportResult({ result, onReset }) {
  const p = result.pipelineResult ?? {}
  const won = (p.winnings ?? 0) > 0

  return (
    <div className="card adm-card">
      <div className="adm-card-header">
        <span className="adm-card-title">Draw #{result.drawId} imported</span>
        <span className={`adm-active-badge ${won ? '' : 'adm-badge-neutral'}`}>
          {won ? 'WIN' : 'NO WIN'}
        </span>
      </div>

      <div className="adm-ticket-meta-grid">
        <div className="adm-meta-row">
          <span className="adm-meta-key">Draw saved</span>
          <span className="adm-meta-val">{result.inserted ? 'New' : 'Already existed'}</span>
        </div>
        <div className="adm-meta-row">
          <span className="adm-meta-key">Ticket found</span>
          <span className="adm-meta-val">{p.ticketFound ? 'Yes' : 'No'}</span>
        </div>
        {p.ticketFound && (
          <>
            <div className="adm-meta-row">
              <span className="adm-meta-key">Total winnings</span>
              <span className="adm-meta-val">₪{p.winnings ?? 0}</span>
            </div>
            <div className="adm-meta-row">
              <span className="adm-meta-key">Net result</span>
              <span className="adm-meta-val">{(p.netResult ?? 0) >= 0 ? '+' : ''}₪{p.netResult ?? 0}</span>
            </div>
            <div className="adm-meta-row">
              <span className="adm-meta-key">Per member</span>
              <span className="adm-meta-val">{(p.memberDelta ?? 0) >= 0 ? '+' : ''}₪{p.memberDelta ?? 0}</span>
            </div>
            <div className="adm-meta-row">
              <span className="adm-meta-key">Settlement</span>
              <span className="adm-meta-val">
                {p.settlementCreated ? 'Created' : p.settlementSkipped ? 'Already existed' : '—'}
              </span>
            </div>
          </>
        )}
        {p.error && (
          <div className="adm-meta-row adm-notes-row">
            <span className="adm-meta-key">Error</span>
            <span className="adm-meta-val adm-notes-text">{p.error}</span>
          </div>
        )}
      </div>

      <button className="adm-btn adm-btn-cancel" onClick={onReset} style={{ marginTop: '12px' }}>
        Import Another Draw
      </button>
    </div>
  )
}
