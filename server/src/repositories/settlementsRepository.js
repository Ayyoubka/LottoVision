/**
 * Data-access layer for the `settlements` Firestore collection.
 *
 * Collection schema  settlements/{auto-id}
 * ─────────────────────────────────────────────────────────────────────
 *  id              string     Firestore document ID
 *  drawId          number     The draw this settlement covers
 *  ticketId        string     Firestore ticket doc ID
 *  ticketCost      number     Total group ticket cost (ILS)
 *  winnings        number     Total prize amount (ILS, 0 = no prize)
 *  netResult       number     winnings - ticketCost (negative = loss)
 *  checkedAt       Timestamp
 *  memberResults   object[]   Per-member accounting snapshot
 *    .memberId     string
 *    .name         string
 *    .delta        number     ILS credited (negative = deducted)
 *    .balanceAfter number
 *
 * Indexes:
 *   settlements: checkedAt DESC   ← single-field, auto-created by Firestore
 *   settlements: drawId            ← single-field, auto-created
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const COLLECTION = 'settlements'

// ── Write ──────────────────────────────────────────────────────────────────

export async function saveSettlement({
  drawId, ticketId, ticketCost, winnings, netResult, memberResults,
}) {
  const db  = getDb()
  const ref = db.collection(COLLECTION).doc()

  const settlement = {
    id: ref.id,
    drawId,
    ticketId,
    ticketCost,
    winnings,
    netResult,
    checkedAt: Timestamp.now(),
    memberResults,
  }

  await ref.set(settlement)
  return settlement
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getLatestSettlement() {
  if (!isFirestoreReady()) return null
  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('checkedAt', 'desc')
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0].data()
}

export async function getRecentSettlements(limit = 10) {
  if (!isFirestoreReady()) return []
  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('checkedAt', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map(d => d.data())
}

/**
 * Fetch the settlement document for a specific draw, or null if none exists.
 */
export async function getSettlementForDraw(drawId) {
  if (!isFirestoreReady()) return null
  const snap = await getDb()
    .collection(COLLECTION)
    .where('drawId', '==', drawId)
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0].data()
}

/**
 * Check whether a settlement already exists for a given draw.
 * Used for idempotency — prevents double-settling the same draw.
 */
export async function settlementExistsForDraw(drawId) {
  if (!isFirestoreReady()) return false
  const snap = await getDb()
    .collection(COLLECTION)
    .where('drawId', '==', drawId)
    .limit(1)
    .get()
  return !snap.empty
}
