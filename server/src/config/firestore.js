/**
 * Firestore client initialisation.
 *
 * Priority order:
 *  1. Render Secret File at /etc/secrets/serviceAccountKey.json
 *  2. FIREBASE_SERVICE_ACCOUNT_JSON env var (JSON string)
 *  3. GOOGLE_APPLICATION_CREDENTIALS env var (file path, local dev)
 *
 * When credentials are absent the module still loads cleanly;
 * isFirestoreReady() returns false and all repository calls are no-ops.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore }                  from 'firebase-admin/firestore'
import { existsSync, readFileSync }      from 'fs'
import { resolve }                       from 'path'

const RENDER_SECRET_PATH = '/etc/secrets/serviceAccountKey.json'

let _db = null

function init() {
  // 1. Render Secret File
  if (existsSync(RENDER_SECRET_PATH)) {
    console.log(`[Firestore] Secret file found at ${RENDER_SECRET_PATH}`)
    try {
      const serviceAccount = JSON.parse(readFileSync(RENDER_SECRET_PATH, 'utf8'))
      if (!getApps().length) initializeApp({ credential: cert(serviceAccount) })
      _db = getFirestore()
      console.log('[Firestore] Firebase Admin initialized via Render secret file ✓')
      return
    } catch (err) {
      console.warn('[Firestore] Failed to load Render secret file:', err.message)
    }
  } else {
    console.warn(`[Firestore] Secret file missing at ${RENDER_SECRET_PATH}`)
  }

  // 2. Production env var: full JSON string
  const jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (jsonString) {
    try {
      const serviceAccount = JSON.parse(jsonString)
      if (!getApps().length) initializeApp({ credential: cert(serviceAccount) })
      _db = getFirestore()
      console.log('[Firestore] Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT_JSON ✓')
      return
    } catch (err) {
      console.warn('[Firestore] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message)
    }
  }

  // 3. Local dev: file path via GOOGLE_APPLICATION_CREDENTIALS
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath) {
    console.warn('[Firestore] No credentials set — running without Firestore')
    return
  }

  const absPath = resolve(process.cwd(), credPath)
  if (!existsSync(absPath)) {
    console.warn(`[Firestore] Credential file not found at ${absPath} — running without Firestore`)
    return
  }

  try {
    const serviceAccount = JSON.parse(readFileSync(absPath, 'utf8'))
    if (!getApps().length) initializeApp({ credential: cert(serviceAccount) })
    _db = getFirestore()
    console.log('[Firestore] Firebase Admin initialized via credentials file ✓')
  } catch (err) {
    console.warn('[Firestore] Initialisation failed:', err.message)
  }
}

init()

/**
 * Returns the Firestore database instance, or null when not configured.
 * Always call this at use-time — never cache the result — so that the
 * live _db reference is read after init() has run.
 */
export const getDb = () => _db

/** Returns true only when the Firestore client is ready to use. */
export const isFirestoreReady = () => _db !== null
