import { useState, useEffect, useCallback } from 'react'
import { fetchMembers }   from '../services/settlementApi.js'
import { createDeposit, fetchDeposits } from '../services/depositsApi.js'
import '../components/dashboard/dashboard.css'
import './AdminTicketScreen.css'

export default function AdminDepositsScreen({ user }) {
  const [members,  setMembers]  = useState([])
  const [deposits, setDeposits] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(null)

  // Form state
  const [memberId,   setMemberId]   = useState('')
  const [amount,     setAmount]     = useState('')
  const [note,       setNote]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const [membersRes, depositsRes] = await Promise.allSettled([
        fetchMembers(token),
        fetchDeposits(token, 30),
      ])
      if (membersRes.status === 'fulfilled')   setMembers(membersRes.value.members ?? [])
      if (depositsRes.status === 'fulfilled')  setDeposits(depositsRes.value.deposits ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    setError(null)
    setSuccess(null)

    if (!memberId)               return setError('Select a member')
    const amt = Number(amount)
    if (!amount || isNaN(amt) || amt <= 0) return setError('Enter a valid amount')

    const member = members.find(m => m.id === memberId)
    if (!member) return setError('Member not found')

    setSaving(true)
    try {
      const token = await user.getIdToken()
      const { deposit, members: updated } = await createDeposit(token, {
        memberId,
        memberName: member.name,
        amount:     amt,
        note:       note.trim() || null,
      })

      setMembers(updated)
      setDeposits(prev => [deposit, ...prev])
      setAmount('')
      setNote('')
      setSuccess(`₪${amt.toLocaleString()} deposited for ${member.name}`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Selected member's current balance for display
  const selectedMember = members.find(m => m.id === memberId)

  return (
    <div className="adm-screen">

      <div className="adm-header">
        <span className="adm-title">Deposits</span>
        <button className="adm-refresh-btn" onClick={load} disabled={loading || saving}>↺</button>
      </div>

      {/* ── Add deposit form ── */}
      <div className="card adm-card">
        <div className="adm-card-header">
          <span className="adm-card-title">Add Deposit</span>
        </div>

        {error   && <p className="adm-error">{error}</p>}
        {success && <p className="adm-success">{success}</p>}

        {/* Member selector */}
        <label className="adm-form-label">Member</label>
        <select
          className="adm-select"
          value={memberId}
          onChange={e => setMemberId(e.target.value)}
          disabled={saving || loading}
        >
          <option value="">— select member —</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}  ({m.balance >= 0 ? '+' : ''}₪{m.balance.toLocaleString()})
            </option>
          ))}
        </select>

        {/* Balance hint */}
        {selectedMember && (
          <p className="adm-deposit-hint">
            Current balance:&nbsp;
            <span className={selectedMember.balance >= 0 ? 'adm-hint-pos' : 'adm-hint-neg'}>
              {selectedMember.balance >= 0 ? '+' : ''}₪{selectedMember.balance.toLocaleString()}
            </span>
          </p>
        )}

        {/* Amount */}
        <label className="adm-form-label">Amount</label>
        <div className="adm-cost-row">
          <span className="adm-cost-prefix">₪</span>
          <input
            className="adm-cost-input"
            type="number"
            min="1"
            step="1"
            placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={saving}
          />
        </div>

        {/* Note */}
        <label className="adm-form-label">Note <span className="adm-range">(optional)</span></label>
        <textarea
          className="adm-notes-input"
          rows={2}
          placeholder="e.g. Cash paid on 01/06"
          value={note}
          onChange={e => setNote(e.target.value)}
          disabled={saving}
        />

        <button
          className="adm-btn adm-btn-create"
          onClick={handleSubmit}
          disabled={saving || loading}
          style={{ marginTop: '4px' }}
        >
          {saving ? 'Saving…' : '+ Add Deposit'}
        </button>
      </div>

      {/* ── Deposit history ── */}
      <div className="card adm-card">
        <div className="adm-card-header">
          <span className="adm-card-title">Recent Deposits</span>
          {deposits.length > 0 && <span className="adm-card-meta">{deposits.length} records</span>}
        </div>

        {loading && <p className="adm-loading">Loading…</p>}

        {!loading && deposits.length === 0 && (
          <p className="adm-empty">No deposits recorded yet.</p>
        )}

        {deposits.length > 0 && (
          <div className="adm-deposit-list">
            {deposits.map(d => (
              <div key={d.id} className="adm-deposit-row">
                <div className="adm-deposit-left">
                  <span className="adm-deposit-name">{d.memberName}</span>
                  {d.note && <span className="adm-deposit-note">{d.note}</span>}
                </div>
                <div className="adm-deposit-right">
                  <span className="adm-deposit-amount">+₪{d.amount.toLocaleString()}</span>
                  <span className="adm-deposit-date">{formatTs(d.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
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
