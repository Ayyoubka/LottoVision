import { useState }             from 'react'
import { updateMemberBalance }  from '../../services/settlementApi.js'
import './dashboard.css'

export default function MembersCard({ members, loading, onBalanceUpdated, user, isAdmin, settlement }) {
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savingId,  setSavingId]  = useState(null)

  const total = members?.reduce((sum, m) => sum + m.balance, 0) ?? 0

  // memberId → delta from the most recent settlement
  const lastDeltas = Object.fromEntries(
    settlement?.memberResults?.map(r => [r.memberId, r.delta]) ?? []
  )

  const startEdit = (m) => { setEditingId(m.id); setEditValue(String(m.balance)) }
  const cancelEdit = ()  => { setEditingId(null); setEditValue('') }

  const saveEdit = async (memberId) => {
    const newBalance = parseFloat(editValue)
    if (isNaN(newBalance)) { cancelEdit(); return }
    setSavingId(memberId)
    try {
      const token = await user.getIdToken()
      const { members: updated } = await updateMemberBalance(token, memberId, newBalance)
      onBalanceUpdated?.(updated)
      cancelEdit()
    } catch (e) {
      console.error('[MembersCard] Balance update failed:', e.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="card db-card">
      <div className="db-card-header">
        <span className="db-card-title">Group Members</span>
        {members && <span className="db-card-meta">{members.length} members</span>}
      </div>

      {loading && <p className="db-loading-msg">Loading members…</p>}

      {!loading && (!members || members.length === 0) && (
        <p className="db-empty-msg">No members yet</p>
      )}

      {members && members.length > 0 && (
        <>
          <div className="db-members-list">
            {members.map(m => {
              const lastDelta      = lastDeltas[m.id] ?? null
              const pl            = round2((m.totalWon ?? 0) - (m.totalPaid ?? 0))
              const totalDeposited = m.totalDeposited ?? 0

              return (
                <div key={m.id ?? m.name} className="db-member-row">

                  {/* ── Top: name + balance + edit ── */}
                  <div className="db-member-top">
                    <span className="db-member-name">{m.name}</span>

                    {editingId === m.id ? (
                      <div className="db-member-edit-row">
                        <span className="db-member-edit-prefix">₪</span>
                        <input
                          className="db-member-edit-input"
                          type="number"
                          step="1"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter')  saveEdit(m.id)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          autoFocus
                        />
                        <button
                          className="db-member-edit-save"
                          onClick={() => saveEdit(m.id)}
                          disabled={savingId === m.id}
                        >
                          {savingId === m.id ? '…' : '✓'}
                        </button>
                        <button className="db-member-edit-cancel" onClick={cancelEdit}>✕</button>
                      </div>
                    ) : (
                      <div className="db-member-right">
                        <span className={`db-member-balance ${balClass(m.balance)}`}>
                          {fmtBalance(m.balance)}
                        </span>
                        {isAdmin && (
                          <button
                            className="db-member-edit-btn"
                            onClick={() => startEdit(m)}
                            title="Edit balance"
                          >✎</button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Stats row (hidden while editing) ── */}
                  {editingId !== m.id && (
                    <div className="db-member-stats">
                      <div className="db-member-stat">
                        <span className="db-stat-label">Last draw</span>
                        <span className={`db-stat-value ${deltaClass(lastDelta)}`}>
                          {fmtDelta(lastDelta)}
                        </span>
                      </div>
                      <div className="db-member-stat">
                        <span className="db-stat-label">P&amp;L</span>
                        <span className={`db-stat-value ${balClass(pl)}`}>
                          {fmtDelta(pl)}
                        </span>
                      </div>
                      <div className="db-member-stat">
                        <span className="db-stat-label">Deposits</span>
                        <span className="db-stat-value db-stat-muted">
                          {totalDeposited > 0 ? `₪${totalDeposited.toLocaleString()}` : '—'}
                        </span>
                      </div>
                    </div>
                  )}

                </div>
              )
            })}
          </div>

          <div className="db-members-total">
            <span className="db-total-label">Pool Total</span>
            <span className={`db-total-value ${balClass(total)}`}>
              {fmtBalance(total)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100
}

/** Format a balance value: "+₪X", "-₪X", or "₪0". */
function fmtBalance(v) {
  if (v === 0) return '₪0'
  return `${v > 0 ? '+' : ''}₪${v.toLocaleString()}`
}

/** Format a delta value: "+₪X", "-₪X", "₪0", or "—" when null. */
function fmtDelta(v) {
  if (v == null) return '—'
  if (v === 0)   return '₪0'
  return `${v > 0 ? '+' : '-'}₪${Math.abs(v).toLocaleString()}`
}

/** CSS color class for a balance or P&L value. */
function balClass(v) {
  if (v > 0) return 'db-bal-pos'
  if (v < 0) return 'db-bal-neg'
  return 'db-stat-muted'
}

/** CSS color class for a delta (null = no settlement yet → muted). */
function deltaClass(v) {
  if (v == null || v === 0) return 'db-stat-muted'
  return v > 0 ? 'db-bal-pos' : 'db-bal-neg'
}
