import { useState, useEffect, useCallback } from 'react'
import {
  fetchActiveWeeklyTicket,
  fetchWeeklyTicketHistory,
  createWeeklyGroupTicket,
  updateWeeklyGroupTicket,
  activateWeeklyGroupTicket,
  deactivateWeeklyGroupTicket,
} from '../services/weeklyTicketApi.js'
import '../components/dashboard/dashboard.css'
import './AdminTicketScreen.css'

const BLANK_LINE = { numbers: Array(6).fill(''), strong: '' }
const BLANK_FORM = { lines: [{ ...BLANK_LINE }], cost: '70', notes: '', effectiveFromDrawId: '' }

export default function AdminTicketScreen({ user }) {
  const [activeTicket,  setActiveTicket]  = useState(undefined)
  const [history,       setHistory]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState(null)

  const [showCreate,    setShowCreate]    = useState(false)
  const [createForm,    setCreateForm]    = useState(BLANK_FORM)
  const [createError,   setCreateError]   = useState(null)

  const [editing,       setEditing]       = useState(false)
  const [editForm,      setEditForm]      = useState(null)
  const [editError,     setEditError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const [activeRes, historyRes] = await Promise.allSettled([
        fetchActiveWeeklyTicket(token),
        fetchWeeklyTicketHistory(token, 30),
      ])
      if (activeRes.status === 'fulfilled')  setActiveTicket(activeRes.value.ticket)
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value.tickets ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  // ── Create ──────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    const valErr = validateLines(createForm.lines)
    if (valErr) { setCreateError(valErr); return }

    setSaving(true)
    setCreateError(null)
    try {
      const token = await user.getIdToken()
      const lines = createForm.lines.map(l => ({
        numbers:      l.numbers.map(n => n === '' ? NaN : Number(n)),
        strongNumber: l.strong === '' ? NaN : Number(l.strong),
      }))
      await createWeeklyGroupTicket(token, {
        lines,
        cost:                createForm.cost ? Number(createForm.cost) : 70,
        notes:               createForm.notes.trim() || null,
        effectiveFromDrawId: createForm.effectiveFromDrawId ? Number(createForm.effectiveFromDrawId) : null,
      })
      setCreateForm(BLANK_FORM)
      setShowCreate(false)
      await load()
    } catch (e) {
      setCreateError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Edit active ticket (cost + notes only for multi-line) ────────────────

  const isMultiLine = t => Array.isArray(t?.lines) && t.lines.length > 1

  const startEdit = () => {
    if (!activeTicket) return
    setEditForm({
      cost:  String(activeTicket.cost ?? 70),
      notes: activeTicket.notes ?? '',
      // single-line only fields (unused for multi-line but kept for compat)
      numbers: activeTicket.numbers.map(String),
      strong:  String(activeTicket.strongNumber),
    })
    setEditError(null)
    setEditing(true)
  }

  const cancelEdit = () => { setEditing(false); setEditForm(null); setEditError(null) }

  const handleSaveEdit = async () => {
    const multi = isMultiLine(activeTicket)
    if (!multi) {
      const nums   = editForm.numbers.map(n => n === '' ? NaN : Number(n))
      const strong = editForm.strong === '' ? NaN : Number(editForm.strong)
      const valErr = validateSingleLine(nums, strong)
      if (valErr) { setEditError(valErr); return }
    }

    setSaving(true)
    setEditError(null)
    try {
      const token = await user.getIdToken()
      const patch = {
        cost:  editForm.cost ? Number(editForm.cost) : 70,
        notes: editForm.notes.trim() || null,
      }
      if (!multi) {
        patch.numbers      = editForm.numbers.map(Number)
        patch.strongNumber = Number(editForm.strong)
      }
      await updateWeeklyGroupTicket(token, activeTicket.id, patch)
      setEditing(false)
      await load()
    } catch (e) {
      setEditError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Deactivate / Re-activate ─────────────────────────────────────────────

  const handleDeactivate = async () => {
    if (!activeTicket) return
    if (!window.confirm('Deactivate the current weekly ticket?')) return
    setSaving(true)
    try {
      const token = await user.getIdToken()
      await deactivateWeeklyGroupTicket(token, activeTicket.id)
      await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const handleReactivate = async (ticketId) => {
    setSaving(true)
    try {
      const token = await user.getIdToken()
      await activateWeeklyGroupTicket(token, ticketId)
      await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="adm-screen">

      <div className="adm-header">
        <span className="adm-title">Weekly Ticket Manager</span>
        <button className="adm-refresh-btn" onClick={load} disabled={loading || saving}>↺</button>
      </div>

      {error && <p className="adm-error">{error}</p>}

      {/* Active ticket card */}
      <div className="card adm-card">
        <div className="adm-card-header">
          <span className="adm-card-title">Active Ticket</span>
          {activeTicket && <span className="adm-active-badge">Live</span>}
        </div>

        {loading && activeTicket === undefined && <p className="adm-loading">Loading…</p>}
        {!loading && !activeTicket && <p className="adm-empty">No active weekly ticket. Create one below.</p>}

        {activeTicket && !editing && (
          <>
            {/* Show all lines */}
            <TicketLines ticket={activeTicket} />
            <div className="adm-ticket-meta-grid">
              <div className="adm-meta-row">
                <span className="adm-meta-key">Lines</span>
                <span className="adm-meta-val">{activeTicket.lines?.length ?? 1}</span>
              </div>
              <div className="adm-meta-row">
                <span className="adm-meta-key">Cost</span>
                <span className="adm-meta-val">₪{activeTicket.cost ?? 70}</span>
              </div>
              <div className="adm-meta-row">
                <span className="adm-meta-key">Created</span>
                <span className="adm-meta-val">{formatTs(activeTicket.createdAt)}</span>
              </div>
              {activeTicket.effectiveFromDrawId && (
                <div className="adm-meta-row">
                  <span className="adm-meta-key">From draw</span>
                  <span className="adm-meta-val">#{activeTicket.effectiveFromDrawId}</span>
                </div>
              )}
              {activeTicket.notes && (
                <div className="adm-meta-row adm-notes-row">
                  <span className="adm-meta-key">Notes</span>
                  <span className="adm-meta-val adm-notes-text">{activeTicket.notes}</span>
                </div>
              )}
            </div>
            <div className="adm-action-row">
              <button className="adm-btn adm-btn-edit"   onClick={startEdit}        disabled={saving}>Edit</button>
              <button className="adm-btn adm-btn-danger" onClick={handleDeactivate} disabled={saving}>Deactivate</button>
            </div>
          </>
        )}

        {activeTicket && editing && editForm && (
          <div className="adm-edit-form">
            {editError && <p className="adm-error">{editError}</p>}
            {isMultiLine(activeTicket) && (
              <p className="adm-info">Multi-line ticket: edit cost and notes only. To change numbers, create a new ticket.</p>
            )}
            {!isMultiLine(activeTicket) && (
              <SingleLineFields form={editForm} setForm={setEditForm} />
            )}
            <label className="adm-form-label">Group Cost</label>
            <div className="adm-cost-row">
              <span className="adm-cost-prefix">₪</span>
              <input className="adm-cost-input" type="number" min="1" step="1"
                value={editForm.cost}
                onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))} />
            </div>
            <label className="adm-form-label">Notes <span className="adm-range">(optional)</span></label>
            <textarea className="adm-notes-input" rows={2}
              value={editForm.notes}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            <div className="adm-action-row">
              <button className="adm-btn adm-btn-save"   onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button className="adm-btn adm-btn-cancel" onClick={cancelEdit} disabled={saving}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Create new ticket */}
      <div className="card adm-card">
        <button className="adm-create-toggle"
          onClick={() => { setShowCreate(v => !v); setCreateError(null) }}>
          {showCreate ? '▲ Hide New Ticket Form' : '+ Create New Weekly Ticket'}
        </button>

        {showCreate && (
          <div className="adm-create-form">
            {createError && <p className="adm-error">{createError}</p>}
            <MultiLineFormFields form={createForm} setForm={setCreateForm} />
            <button className="adm-btn adm-btn-create" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : '★ Create & Activate'}
            </button>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="card adm-card">
          <div className="adm-card-header">
            <span className="adm-card-title">Ticket History</span>
            <span className="adm-card-meta">{history.length} tickets</span>
          </div>
          <div className="adm-history-list">
            {history.map(t => (
              <div key={t.id} className={`adm-history-row ${t.active ? 'adm-history-active' : ''}`}>
                <div className="adm-history-left">
                  <div className="adm-history-balls">
                    {t.numbers.map(n => (
                      <span key={n} className="adm-hist-ball">{n}</span>
                    ))}
                    <span className="adm-hist-strong">{t.strongNumber}</span>
                    {Array.isArray(t.lines) && t.lines.length > 1 && (
                      <span className="adm-hist-lines-badge">+{t.lines.length - 1} more</span>
                    )}
                  </div>
                  <div className="adm-history-info">
                    <span className="adm-hist-date">{formatTs(t.createdAt)}</span>
                    <span className="adm-hist-cost">₪{t.cost ?? 70}</span>
                    {t.notes && <span className="adm-hist-notes">{t.notes}</span>}
                  </div>
                </div>
                <div className="adm-history-right">
                  {t.active
                    ? <span className="adm-active-badge">Active</span>
                    : (
                      <button className="adm-btn adm-btn-reactivate"
                        onClick={() => handleReactivate(t.id)} disabled={saving}>
                        Re-use
                      </button>
                    )
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Displays all lines of a ticket (single or multi). */
function TicketLines({ ticket }) {
  const lines = (Array.isArray(ticket.lines) && ticket.lines.length > 0)
    ? ticket.lines
    : [{ numbers: ticket.numbers, strongNumber: ticket.strongNumber }]

  return (
    <div className="adm-lines-display">
      {lines.map((line, i) => (
        <div key={i} className="adm-balls-row">
          {lines.length > 1 && <span className="adm-line-num">{i + 1}</span>}
          {line.numbers.map((n, j) => (
            <span key={j} className="adm-ball">{n}</span>
          ))}
          <span className="adm-ball adm-ball-strong">{line.strongNumber}</span>
        </div>
      ))}
    </div>
  )
}

/** Single-line number fields (used in edit form for single-line tickets). */
function SingleLineFields({ form, setForm }) {
  const setNum = (i, raw) => {
    const val  = raw.replace(/\D/g, '').slice(0, 2)
    const next = [...form.numbers]
    next[i]    = val
    setForm(f => ({ ...f, numbers: next }))
  }
  return (
    <>
      <label className="adm-form-label">Main Numbers <span className="adm-range">(1–37)</span></label>
      <div className="adm-nums-grid">
        {form.numbers.map((val, i) => (
          <input key={i} className="adm-num-input" type="text" inputMode="numeric"
            maxLength={2} placeholder="–" value={val}
            onChange={e => setNum(i, e.target.value)} />
        ))}
      </div>
      <label className="adm-form-label">Strong Number <span className="adm-range">(1–7)</span></label>
      <input className="adm-num-input adm-strong-input" type="text" inputMode="numeric"
        maxLength={1} placeholder="–" value={form.strong}
        onChange={e => setForm(f => ({ ...f, strong: e.target.value.replace(/\D/g, '').slice(0, 1) }))} />
    </>
  )
}

/** Multi-line form: each line has 6 numbers + strong, plus add/remove controls. */
function MultiLineFormFields({ form, setForm }) {
  const setLineNum = (lineIdx, numIdx, raw) => {
    const val   = raw.replace(/\D/g, '').slice(0, 2)
    const lines = form.lines.map((l, i) => {
      if (i !== lineIdx) return l
      const nums = [...l.numbers]
      nums[numIdx] = val
      return { ...l, numbers: nums }
    })
    setForm(f => ({ ...f, lines }))
  }

  const setLineStrong = (lineIdx, raw) => {
    const val   = raw.replace(/\D/g, '').slice(0, 1)
    const lines = form.lines.map((l, i) => i === lineIdx ? { ...l, strong: val } : l)
    setForm(f => ({ ...f, lines }))
  }

  const addLine = () => {
    if (form.lines.length >= 14) return
    setForm(f => ({ ...f, lines: [...f.lines, { ...BLANK_LINE }] }))
  }

  const removeLine = (idx) => {
    if (form.lines.length <= 1) return
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="adm-form-fields">
      {form.lines.map((line, idx) => (
        <div key={idx} className="adm-line-row">
          <div className="adm-line-header">
            <span className="adm-line-label">Line {idx + 1}</span>
            {form.lines.length > 1 && (
              <button type="button" className="adm-btn-remove-line"
                onClick={() => removeLine(idx)}>✕</button>
            )}
          </div>
          <div className="adm-nums-grid">
            {line.numbers.map((val, ni) => (
              <input key={ni} className="adm-num-input" type="text" inputMode="numeric"
                maxLength={2} placeholder="–" value={val}
                onChange={e => setLineNum(idx, ni, e.target.value)} />
            ))}
            <input className="adm-num-input adm-strong-input" type="text"
              inputMode="numeric" maxLength={1} placeholder="S" value={line.strong}
              onChange={e => setLineStrong(idx, e.target.value)} />
          </div>
        </div>
      ))}

      {form.lines.length < 14 && (
        <button type="button" className="adm-btn-add-line" onClick={addLine}>
          + Add Line ({form.lines.length}/14)
        </button>
      )}

      <label className="adm-form-label">Group Cost <span className="adm-range">(total for all lines)</span></label>
      <div className="adm-cost-row">
        <span className="adm-cost-prefix">₪</span>
        <input className="adm-cost-input" type="number" min="1" step="1"
          value={form.cost}
          onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
      </div>

      <label className="adm-form-label">Notes <span className="adm-range">(optional)</span></label>
      <textarea className="adm-notes-input" rows={2}
        placeholder="e.g. New numbers for June"
        value={form.notes}
        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />

      <label className="adm-form-label">Effective from Draw # <span className="adm-range">(optional)</span></label>
      <input className="adm-cost-input" type="number" min="1" placeholder="e.g. 3930"
        value={form.effectiveFromDrawId}
        onChange={e => setForm(f => ({ ...f, effectiveFromDrawId: e.target.value }))} />
    </div>
  )
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateSingleLine(nums, strong) {
  if (nums.some(isNaN))                   return 'Please fill all 6 numbers'
  if (nums.some(n => n < 1 || n > 37))   return 'Main numbers must be 1–37'
  if (new Set(nums).size !== 6)           return 'All 6 numbers must be unique'
  if (isNaN(strong))                      return 'Please enter the strong number'
  if (strong < 1 || strong > 7)           return 'Strong number must be 1–7'
  return null
}

function validateLines(lines) {
  if (!lines || lines.length === 0) return 'At least one line is required'
  if (lines.length > 14)            return 'Maximum 14 lines'
  for (let i = 0; i < lines.length; i++) {
    const nums   = lines[i].numbers.map(n => n === '' ? NaN : Number(n))
    const strong = lines[i].strong  === '' ? NaN : Number(lines[i].strong)
    const err    = validateSingleLine(nums, strong)
    if (err) return `Line ${i + 1}: ${err}`
  }
  return null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTs(ts) {
  if (!ts) return ''
  const ms = (ts._seconds ?? ts.seconds ?? 0) * 1000
  if (!ms) return ''
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
