import { useState } from 'react'
import { sendTestNotification } from '../../services/notificationsApi.js'
import './dashboard.css'

/**
 * Shows Telegram notification status: connected/disconnected, last success/failure.
 * Includes a "Send Test" button for quick verification.
 *
 * Props:
 *   status  — result from fetchNotificationStatus (may be null if loading failed)
 *   user    — Firebase user (for getIdToken)
 *   onRefresh — called after test send so parent can reload status
 */
export default function NotificationsCard({ status, user, onRefresh }) {
  const [testing,     setTesting]     = useState(false)
  const [testResult,  setTestResult]  = useState(null)  // null | 'ok' | 'fail'
  const [testError,   setTestError]   = useState(null)

  const telegram = status?.channels?.telegram

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const token   = await user.getIdToken()
      const { results } = await sendTestNotification(token)
      const tg = results.find(r => r.channel === 'telegram')
      if (tg?.ok) {
        setTestResult('ok')
      } else {
        setTestResult('fail')
        setTestError(tg?.error ?? 'Unknown error')
      }
      onRefresh?.()
    } catch (e) {
      setTestResult('fail')
      setTestError(e.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="card db-card db-notif-card">
      <div className="db-card-header">
        <span className="db-card-title">Notifications</span>
        <button
          className="db-notif-test-btn"
          onClick={handleTest}
          disabled={testing || !telegram?.configured}
          title={telegram?.configured ? 'Send test message' : 'Telegram not configured'}
        >
          {testing ? '…' : 'Test'}
        </button>
      </div>

      {/* Telegram row */}
      <div className="db-notif-channel-row">
        <span className="db-notif-channel-name">Telegram</span>

        {!telegram && (
          <span className="db-notif-status db-notif-unconfigured">—</span>
        )}

        {telegram && !telegram.configured && (
          <span className="db-notif-status db-notif-unconfigured">Not configured</span>
        )}

        {telegram?.configured && telegram.connected && (
          <span className="db-notif-status db-notif-connected">
            <span className="db-notif-dot" />
            {telegram.botName ? `@${telegram.botName}` : 'Connected'}
          </span>
        )}

        {telegram?.configured && !telegram.connected && (
          <span className="db-notif-status db-notif-error">
            <span className="db-notif-dot" />
            {telegram.error ?? 'Unreachable'}
          </span>
        )}
      </div>

      {/* Last success */}
      {telegram?.lastSuccess && (
        <div className="db-notif-last-row">
          <span className="db-notif-last-key">Last sent</span>
          <span className="db-notif-last-val db-notif-success-val">
            {formatTs(telegram.lastSuccess.sentAt)}
            {telegram.lastSuccess.drawId ? ` · Draw #${telegram.lastSuccess.drawId}` : ''}
          </span>
        </div>
      )}

      {/* Last failure */}
      {telegram?.lastFailure && (
        <div className="db-notif-last-row">
          <span className="db-notif-last-key">Last error</span>
          <span className="db-notif-last-val db-notif-fail-val">
            {formatTs(telegram.lastFailure.sentAt)}
          </span>
        </div>
      )}

      {/* Test result feedback */}
      {testResult === 'ok' && (
        <p className="db-notif-feedback db-notif-feedback-ok">✓ Test message sent</p>
      )}
      {testResult === 'fail' && (
        <p className="db-notif-feedback db-notif-feedback-fail">
          ✕ {testError ?? 'Send failed'}
        </p>
      )}

      {/* Setup hint when unconfigured */}
      {telegram && !telegram.configured && (
        <p className="db-notif-hint">
          Set <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_CHAT_ID</code> in server/.env
        </p>
      )}
    </div>
  )
}

function formatTs(ts) {
  const ms = (ts?._seconds ?? ts?.seconds ?? 0) * 1000
  if (!ms) return ''
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
