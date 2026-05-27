/**
 * Firestore client initialisation.
 *
 * Local dev:
 *  1. Firebase Console → Project Settings → Service Accounts
 *     → Generate new private key → save as server/serviceAccountKey.json
 *  2. In server/.env set:
 *       GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *
 * Production (Render, Railway, etc.):
 *  Set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON contents of the
 *  service account key file (copy-paste the entire file as a single line).
 *
 * When credentials are absent the module still loads cleanly;
 * isFirestoreReady() returns false and all repository calls are no-ops.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore }                  from 'firebase-admin/firestore'
import { existsSync, readFileSync }      from 'fs'
import { resolve }                       from 'path'

let _db = null

function init() {
  // Production: JSON string in env var (no filesystem required)
  const jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (jsonString) {
    try {
      const serviceAccount = JSON.parse(jsonString)
      if (!getApps().length) initializeApp({ credential: cert(serviceAccount) })
      _db = getFirestore()
      console.log('[Firestore] Connected via FIREBASE_SERVICE_ACCOUNT_JSON ✓')
      return
    } catch (err) {
      console.warn('[Firestore] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message)
    }
  }

  // Local dev: file path via GOOGLE_APPLICATION_CREDENTIALS
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
    console.log('[Firestore] Connected via credentials file ✓')
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
