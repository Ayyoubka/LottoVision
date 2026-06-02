import { getDb, isFirestoreReady } from '../config/firestore.js'

/**
 * Express middleware that requires the authenticated user to have role 'admin'.
 * Must be used after verifyToken (depends on req.uid being set).
 *
 * Returns 403 if the user's Firestore profile has role !== 'admin'.
 * Returns 503 if Firestore is unavailable.
 */
export async function requireAdmin(req, res, next) {
  if (!isFirestoreReady()) {
    return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
  }

  try {
    const snap = await getDb().collection('users').doc(req.uid).get()

    if (!snap.exists || snap.data().role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' })
    }

    next()
  } catch (err) {
    res.status(503).json({ error: 'AUTH_CHECK_FAILED', message: err.message })
  }
}
