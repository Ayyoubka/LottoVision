import { getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

/**
 * Express middleware that verifies a Firebase ID token.
 *
 * Expects:  Authorization: Bearer <idToken>
 * Attaches: req.uid, req.email on success
 */
export async function verifyToken(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' })
  }

  if (!getApps().length) {
    return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED', message: 'Firebase Admin not initialised' })
  }

  try {
    const decoded = await getAuth().verifyIdToken(token)
    req.uid   = decoded.uid
    req.email = decoded.email ?? ''
    next()
  } catch (err) {
    const expired = err.code === 'auth/id-token-expired'
    res.status(401).json({
      error:   expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      message: err.message,
    })
  }
}
