import { useState }             from 'react'
import { updateMemberBalance }  from '../../services/settlementApi.js'
import './dashboard.css'

export default function MembersCard({ members, loading, onBalanceUpdated, user }) {
  const [editingId,    setEditingId]    = useState(null)
  const [editValue,    setEditValue]    = useState('')
  const [savingId,     setSavingId]     = useState(null)

  const total = members?.reduce((sum, m) => sum + m.balance, 0) ?? 0

  const startEdit = (m) => {
    setEditingId(m.id)
    setEditValue(String(m.balance))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

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
            {members.map(m => (
              <div key={m.id ?? m.name} className="db-member-row">
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
                    <span className={`db-member-balance ${m.balance >= 0 ? 'db-bal-pos' : 'db-bal-neg'}`}>
                      {m.balance >= 0 ? '+' : ''}₪{m.balance.toLocaleString()}
                    </span>
                    {m.totalWon > 0 && (
                      <span className="db-member-won" title="Total won">🏆 ₪{m.totalWon.toLocaleString()}</span>
                    )}
                    <button className="db-member-edit-btn" onClick={() => startEdit(m)} title="Edit balance">✎</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="db-members-total">
            <span className="db-total-label">Pool Total</span>
            <span className={`db-total-value ${total >= 0 ? 'db-bal-pos' : 'db-bal-neg'}`}>
              {total >= 0 ? '+' : ''}₪{total.toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
