/**
 * Data-access layer for the `deposits` Firestore collection.
 *
 * Collection schema  deposits/{auto-id}
 * ─────────────────────────────────────────────────────────────────────
 *  id          string     Firestore document ID
 *  memberId    string     groupMembers document ID
 *  memberName  string     denormalized — avoids a join on list views
 *  amount      number     ILS, always positive
 *  note        string|null
 *  createdAt   Timestamp
 *  createdBy   string     uid of the admin who recorded the deposit
 *
 * Indexes (single-field, auto-created by Firestore):
 *   deposits: createdAt DESC  ← getRecentDeposits
 *   deposits: memberId        ← getMemberDeposits (filtered + ordered)
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const COLLECTION = 'deposits'

/**
 * Write one deposit record.
 * @returns {Promise<object>} The saved document
 */
export async function saveDeposit({ memberId, memberName, amount, note, createdBy }) {
  if (!isFirestoreReady()) return null
  const db     = getDb()
  const docRef = db.collection(COLLECTION).doc()

  const deposit = {
    id:         docRef.id,
    memberId,
    memberName,
    amount,
    note:       note ?? null,
    createdAt:  Timestamp.now(),
    createdBy,
  }

  await docRef.set(deposit)
  return deposit
}

/**
 * Fetch the most recent deposits across all members, newest first.
 * @param {number} [limit=30]
 */
export async function getRecentDeposits(limit = 30) {
  if (!isFirestoreReady()) return []
  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(limit, 100))
    .get()
  return snap.docs.map(d => d.data())
}

/**
 * Fetch deposits for a single member, newest first.
 * @param {string} memberId
 * @param {number} [limit=30]
 */
export async function getMemberDeposits(memberId, limit = 30) {
  if (!isFirestoreReady()) return []
  const snap = await getDb()
    .collection(COLLECTION)
    .where('memberId', '==', memberId)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(limit, 100))
    .get()
  return snap.docs.map(d => d.data())
}
