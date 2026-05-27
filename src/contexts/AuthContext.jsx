import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth, isFirebaseConfigured }    from '../config/firebase.js'
import { registerProfile, fetchProfile } from '../services/authApi.js'

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// ── Provider ───────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)
  const [profile, setProfile]     = useState(null)
  const [authLoading, setLoading] = useState(true)
  const skipFetch                 = useRef(false)

  useEffect(() => {
    // ── No Firebase config: skip auth, fall straight to AuthScreen ───────
    if (!isFirebaseConfigured || !auth) {
      setLoading(false)
      return
    }

    let settled = false

    // Safety net: if onAuthStateChanged never fires (bad config, network issue,
    // or React StrictMode double-mount teardown) unblock the UI after 5 s.
    const fallback = setTimeout(() => {
      if (!settled) {
        console.warn('[Auth] onAuthStateChanged did not fire — unblocking UI')
        setLoading(false)
      }
    }, 5000)

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      settled = true
      clearTimeout(fallback)

      setUser(firebaseUser)

      if (!firebaseUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      if (skipFetch.current) {
        skipFetch.current = false
        setLoading(false)
        return
      }

      try {
        const token = await firebaseUser.getIdToken()
        const prof  = await fetchProfile(token)
        setProfile(prof)
      } catch {
        setProfile(null)
      } finally {
        setLoading(false)
      }
    })

    return () => {
      unsub()
      clearTimeout(fallback)
    }
  }, [])

  // ── Auth actions ─────────────────────────────────────────────────────────

  async function register(email, password, fullName) {
    if (!auth) throw new Error('Firebase is not configured')
    skipFetch.current = true
    const cred  = await createUserWithEmailAndPassword(auth, email, password)
    const token = await cred.user.getIdToken()
    const prof  = await registerProfile(token, fullName)
    setUser(cred.user)
    setProfile(prof)
  }

  async function login(email, password) {
    if (!auth) throw new Error('Firebase is not configured')
    setLoading(true)
    await signInWithEmailAndPassword(auth, email, password)
    // onAuthStateChanged fires next and sets user + profile
  }

  async function logout() {
    if (auth) await signOut(auth)
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, authLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
