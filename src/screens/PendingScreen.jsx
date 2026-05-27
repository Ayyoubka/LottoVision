import { useAuth } from '../contexts/AuthContext.jsx'
import '../auth.css'

export default function PendingScreen() {
  const { profile, logout } = useAuth()

  return (
    <div className="auth-screen">
      <div className="auth-inner">

        <div className="auth-header">
          <div className="auth-logo-icon">🎱</div>
          <h1 className="auth-logo-text">LOTO</h1>
        </div>

        <div className="pending-card">
          <div className="pending-icon">⏳</div>

          <h2 className="pending-title">Waiting for Approval</h2>

          <p className="pending-body">
            Your account has been created and is pending review.
            You will receive access once an admin approves it.
          </p>

          {profile?.email && (
            <div className="pending-email-strip">
              <span className="pending-email-label">Registered as</span>
              <span className="pending-email">{profile.email}</span>
            </div>
          )}

          <div className="pending-divider" />

          <p className="pending-hint">
            If you believe this is taking too long, contact your administrator.
          </p>

          <button className="pending-logout-btn" onClick={logout}>
            Sign Out
          </button>
        </div>

      </div>
    </div>
  )
}
