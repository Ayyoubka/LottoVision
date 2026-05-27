/**
 * Data-access layer for the `draws` Firestore collection.
 *
 * Collection schema  draws/{drawId}
 * ─────────────────────────────────────────────────────────────────────
 *  drawId       number     sequential Pais draw ID  (document ID as string)
 *  date         string     "DD/MM/YYYY"
 *  numbers      number[]   sorted 6 main numbers  [1–37]
 *  strongNumber number     1–7
 *  fetchedAt    Timestamp
 *
 *  — Analytics-ready derived fields —
 *  year         number     e.g. 2026
 *  month        number     1–12
 *  dayOfWeek    number     0 = Sunday … 6 = Saturday
 *
 * Recommended Firestore indexes (Firebase Console):
 *   draws: drawId DESC          ← getRecentDraws / getDrawsForStats
 *   draws: year ASC, month ASC  ← monthly analytics
 *   draws: dayOfWeek ASC        ← day-of-week analytics
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const COLLECTION = 'draws'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parse "DD/MM/YYYY" → { day, month, year, dayOfWeek } */
function parseDate(dateStr) {
  const [day, month, year] = (dateStr ?? '').split('/').map(Number)
  if (!year) return { day: 0, month: 0, year: 0, dayOfWeek: 0 }
  return { day, month, year, dayOfWeek: new Date(year, month - 1, day).getDay() }
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Save a draw to Firestore, idempotent by drawId.
 * @returns {Promise<{ saved: boolean, reason?: string }>}
 */
export async function saveDraw(draw) {
  if (!isFirestoreReady()) return { saved: false, reason: 'not_configured' }

  const docRef   = getDb().collection(COLLECTION).doc(String(draw.drawId))
  const snapshot = await docRef.get()

  if (snapshot.exists) return { saved: false, reason: 'duplicate' }

  const { month, year, dayOfWeek } = parseDate(draw.date)

  await docRef.set({
    drawId:       draw.drawId,
    date:         draw.date,
    numbers:      draw.numbers,
    strongNumber: draw.strongNumber,
    fetchedAt:    Timestamp.now(),
    year,
    month,
    dayOfWeek,
  })

  return { saved: true }
}

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * Fetch a single draw by its sequential ID.
 * @returns {Promise<object|null>}
 */
export async function getDraw(drawId) {
  if (!isFirestoreReady()) return null

  const snap = await getDb().collection(COLLECTION).doc(String(drawId)).get()
  return snap.exists ? snap.data() : null
}

/**
 * Fetch the N most recent draws, newest first.
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export async function getRecentDraws(limit = 10) {
  if (!isFirestoreReady()) return []

  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('drawId', 'desc')
    .limit(Math.min(limit, 100))
    .get()

  return snap.docs.map(d => d.data())
}

/**
 * Fetch up to `limit` of the most recent draws for analytics.
 * Identical query to getRecentDraws but with a higher cap (100).
 * @param {number} limit  one of 12 | 24 | 50 | 100
 * @returns {Promise<object[]>}
 */
export async function getDrawsForStats(limit) {
  if (!isFirestoreReady()) return []

  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('drawId', 'desc')
    .limit(Math.min(limit, 100))
    .get()

  return snap.docs.map(d => d.data())
}
