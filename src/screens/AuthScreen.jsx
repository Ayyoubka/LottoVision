import { useState } from 'react'
import { useAuth }  from '../contexts/AuthContext.jsx'
import '../auth.css'

export default function AuthScreen() {
  const { login, register } = useAuth()

  const [tab, setTab]               = useState('login')   // 'login' | 'register'
  const [fullName, setFullName]     = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [showPass, setShowPass]     = useState(false)

  const switchTab = (t) => {
    setTab(t)
    setError('')
    setFullName('')
    setEmail('')
    setPassword('')
    setConfirm('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (tab === 'register') {
      if (!fullName.trim())           return setError('Full name is required')
      if (fullName.trim().length < 2) return setError('Full name is too short')
      if (password !== confirm)       return setError('Passwords do not match')
      if (password.length < 6)        return setError('Password must be at least 6 characters')
    }

    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(email, password, fullName)
      }
    } catch (err) {
      setError(friendlyError(err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-inner">

        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo-icon">🎱</div>
          <h1 className="auth-logo-text">LOTO</h1>
          <p className="auth-tagline">
            {tab === 'login' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Tab toggle */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
            type="button"
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form className="auth-card" onSubmit={handleSubmit} noValidate>

          {tab === 'register' && (
            <div className="auth-field-group">
              <label className="auth-field-label">Full Name</label>
              <input
                className="auth-input"
                type="text"
                autoComplete="name"
                placeholder="Your full name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-field-group">
            <label className="auth-field-label">Email</label>
            <input
              className="auth-input"
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field-group">
            <label className="auth-field-label">Password</label>
            <div className="auth-input-wrap">
              <input
                className="auth-input"
                type={showPass ? 'text' : 'password'}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                placeholder={tab === 'register' ? 'Min. 6 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPass(v => !v)}
                tabIndex={-1}
              >
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {tab === 'register' && (
            <div className="auth-field-group">
              <label className="auth-field-label">Confirm Password</label>
              <input
                className="auth-input"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit-btn" type="submit" disabled={loading}>
            {loading
              ? <span className="loading-dots">{tab === 'login' ? 'Signing in' : 'Creating account'}<span>…</span></span>
              : tab === 'login' ? 'Sign In' : 'Create Account'
            }
          </button>

        </form>

        <p className="auth-switch-hint">
          {tab === 'login'
            ? <>No account? <button className="auth-link-btn" onClick={() => switchTab('register')}>Register here</button></>
            : <>Already have an account? <button className="auth-link-btn" onClick={() => switchTab('login')}>Sign in</button></>
          }
        </p>

      </div>
    </div>
  )
}

// ── Map Firebase error codes to readable messages ─────────────────────────

function friendlyError(msg = '') {
  if (msg.includes('not configured'))
    return 'Firebase is not set up yet — add VITE_FIREBASE_* values to your .env file'
  if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential'))
    return 'Invalid email or password'
  if (msg.includes('email-already-in-use'))
    return 'An account with this email already exists'
  if (msg.includes('weak-password'))
    return 'Password is too weak — use at least 6 characters'
  if (msg.includes('invalid-email'))
    return 'Invalid email address'
  if (msg.includes('too-many-requests'))
    return 'Too many attempts — please wait a moment and try again'
  if (msg.includes('network-request-failed') || msg.includes('fetch'))
    return 'Network error — check your connection and try again'
  return msg
}
