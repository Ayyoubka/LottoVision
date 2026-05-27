import { Router }        from 'express'
import { Timestamp }     from 'firebase-admin/firestore'
import { getDb, isFirestoreReady } from '../config/firestore.js'
import { verifyToken }   from '../middleware/verifyToken.js'

const router = Router()

// All auth routes require a valid Firebase ID token
router.use(verifyToken)

// ── POST /api/auth/register ────────────────────────────────────────────────
/**
 * Create a Firestore user document for a newly registered Firebase Auth user.
 * Idempotent: if the document already exists the existing profile is returned.
 *
 * Body:    { fullName: string }
 * Returns: UserProfile
 */
router.post('/register', async (req, res) => {
  const { fullName } = req.body ?? {}

  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ error: 'MISSING_NAME', message: 'fullName is required' })
  }

  if (!isFirestoreReady()) {
    return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
  }

  try {
    const db     = getDb()
    const docRef = db.collection('users').doc(req.uid)
    const snap   = await docRef.get()

    // Idempotent — return existing profile without overwriting
    if (snap.exists) {
      return res.json(snap.data())
    }

    const isAdmin = req.email === process.env.ADMIN_BOOTSTRAP_EMAIL

    const profile = {
      uid:           req.uid,
      fullName:      fullName.trim(),
      email:         req.email,
      role:          isAdmin ? 'admin' : 'user',
      approved:      isAdmin ? true : false,
      createdAt:     Timestamp.now(),
      balance:       0,
      totalDeposits: 0,
      totalCharges:  0,
      totalWinnings: 0,
    }

    await docRef.set(profile)

    console.log(`[Auth] New user registered: ${req.email} (${req.uid}) role=${profile.role} approved=${profile.approved}`)
    res.status(201).json(profile)
  } catch (err) {
    console.error('[/api/auth/register]', err.message)
    res.status(500).json({ error: 'REGISTRATION_FAILED', message: err.message })
  }
})

// ── GET /api/auth/me ───────────────────────────────────────────────────────
/**
 * Return the Firestore profile for the authenticated user.
 *
 * Returns: UserProfile
 * 404 if no profile exists (user registered in Firebase but never called /register)
 */
router.get('/me', async (req, res) => {
  if (!isFirestoreReady()) {
    return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
  }

  try {
    const snap = await getDb().collection('users').doc(req.uid).get()

    if (!snap.exists) {
      return res.status(404).json({ error: 'PROFILE_NOT_FOUND' })
    }

    res.json(snap.data())
  } catch (err) {
    console.error('[/api/auth/me]', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
