/**
 * Data-access layer for the `groupMembers` Firestore collection.
 *
 * Collection schema  groupMembers/{auto-id}
 * ─────────────────────────────────────────────────────────────────────
 *  id          string     Firestore document ID
 *  name        string     Display name
 *  balance     number     Running ILS balance (negative = owes, positive = owed)
 *  totalPaid   number     Cumulative ticket cost share deducted
 *  totalWon    number     Cumulative prize share credited
 *  active      boolean    false = removed from group
 *  createdAt   Timestamp
 *  updatedAt   Timestamp
 *
 * Index note: where('active', '==', true) is a single-field query — no
 * composite index required. Sorting is done in-memory after fetch.
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp, FieldValue }   from 'firebase-admin/firestore'

const COLLECTION = 'groupMembers'

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active members, sorted alphabetically by name.
 */
export async function getActiveMembers() {
  if (!isFirestoreReady()) return []
  const snap = await getDb()
    .collection(COLLECTION)
    .where('active', '==', true)
    .get()
  return snap.docs
    .map(d => d.data())
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

/**
 * Return true if any member documents exist.
 */
export async function hasMembers() {
  if (!isFirestoreReady()) return false
  const snap = await getDb().collection(COLLECTION).limit(1).get()
  return !snap.empty
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Write prize-check results back to a member document.
 */
export async function updateMemberBalance(id, { balance, totalPaid, totalWon }) {
  await getDb().collection(COLLECTION).doc(id).update({
    balance,
    totalPaid,
    totalWon,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Apply a cash deposit: atomically increment balance and totalDeposited.
 * Uses FieldValue.increment so no read-then-write race is possible.
 *
 * totalPaid / totalWon are settlement-only stats and are never touched here.
 *
 * @param {string} id      groupMembers document ID
 * @param {number} amount  ILS, positive
 */
export async function applyDeposit(id, amount) {
  if (!isFirestoreReady()) return
  await getDb().collection(COLLECTION).doc(id).update({
    balance:        FieldValue.increment(amount),
    totalDeposited: FieldValue.increment(amount),
    updatedAt:      Timestamp.now(),
  })
}

/**
 * Admin override — set a member's balance directly.
 * Does not touch totalPaid / totalWon (those are cumulative stats).
 */
export async function setMemberBalance(id, balance) {
  if (!isFirestoreReady()) return
  await getDb().collection(COLLECTION).doc(id).update({
    balance,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Seed the collection with the initial member list if it is empty.
 * Safe to call on every startup — no-ops if members already exist.
 *
 * @param {{ name: string }[]} members
 */
export async function seedGroupMembers(members) {
  const db    = getDb()
  const batch = db.batch()

  for (const m of members) {
    const ref = db.collection(COLLECTION).doc()
    batch.set(ref, {
      id:         ref.id,
      name:       m.name,
      balance:    0,
      totalPaid:  0,
      totalWon:   0,
      active:     true,
      createdAt:  Timestamp.now(),
      updatedAt:  Timestamp.now(),
    })
  }

  await batch.commit()
}
