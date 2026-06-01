/**
 * Data-access layer for the `prize_tables` Firestore collection.
 *
 * Collection schema  prize_tables/{drawId}
 * ─────────────────────────────────────────────────────────────────────
 *  drawId   number     same as document ID
 *  prizes   object     per-tier ILS amounts entered by admin
 *    '3':   number
 *    '3+s': number
 *    '4':   number
 *    '4+s': number
 *    '5':   number
 *    '5+s': number
 *    '6':   number
 *    '6+s': number
 *  savedAt  Timestamp
 *
 * One document per draw.  savePrizeTable() is an upsert so the admin
 * can correct a typo by re-submitting the same draw.
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const COLLECTION = 'prize_tables'

const REQUIRED_KEYS = ['3', '3+s', '4', '4+s', '5', '5+s', '6', '6+s']

/**
 * Upsert a prize table for a given draw.
 * @param {number} drawId
 * @param {Record<string, number>} prizes  — all 8 tier keys required
 */
export async function savePrizeTable(drawId, prizes) {
  if (!isFirestoreReady()) return
  await getDb()
    .collection(COLLECTION)
    .doc(String(drawId))
    .set({ drawId, prizes, savedAt: Timestamp.now() })
}

/**
 * Fetch the prize table for a draw.
 * Returns the prizes object, or null if no table has been saved for this draw.
 * @param {number} drawId
 * @returns {Promise<Record<string, number>|null>}
 */
export async function getPrizeTable(drawId) {
  if (!isFirestoreReady()) return null
  const snap = await getDb().collection(COLLECTION).doc(String(drawId)).get()
  return snap.exists ? snap.data().prizes : null
}

export { REQUIRED_KEYS }
