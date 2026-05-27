import { initializeApp, getApps } from 'firebase/app'
import { getAuth }                from 'firebase/auth'

const apiKey     = import.meta.env.VITE_FIREBASE_API_KEY
const projectId  = import.meta.env.VITE_FIREBASE_PROJECT_ID
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
const appId      = import.meta.env.VITE_FIREBASE_APP_ID

// True when all required env vars are present and non-empty
export const isFirebaseConfigured = !!(apiKey && projectId && authDomain && appId)

let _auth = null

if (isFirebaseConfigured) {
  try {
    const firebaseConfig = {
      apiKey,
      authDomain,
      projectId,
      storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId,
    }
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    _auth = getAuth(app)
  } catch (err) {
    console.error('[Firebase] Initialisation failed:', err.message)
  }
} else {
  console.warn(
    '[Firebase] Missing environment variables.\n' +
    'Copy .env.example → .env and fill in VITE_FIREBASE_* values.\n' +
    'Auth is disabled — the login screen will still render.'
  )
}

// auth is null when Firebase is not configured or failed to initialise.
// All consumers must handle auth === null.
export const auth = _auth
