/**
 * Data-access layer for the `weekly_tickets` Firestore collection.
 *
 * Collection schema  weekly_tickets/{auto-id}
 * ─────────────────────────────────────────────────────────────
 *  id                 string
 *  numbers            number[]    6 sorted main numbers (1–37)
 *  strongNumber       number      1–7
 *  cost               number      total group cost in ILS (default 70)
 *  active             boolean     only one document should be true at a time
 *  notes              string|null admin-supplied notes
 *  createdBy          string      uid of the admin who created this ticket
 *  effectiveFromDrawId number|null draw from which this ticket is in play
 *  createdAt          Timestamp
 *  updatedAt          Timestamp|null
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const COLLECTION = 'weekly_tickets'

export async function saveWeeklyTicket({ numbers, strongNumber, lines, cost, notes, createdBy, effectiveFromDrawId }) {
  if (!isFirestoreReady()) return null
  const db     = getDb()
  const docRef = db.collection(COLLECTION).doc()

  // Normalise: if lines are provided use them; derive the flat fields from line 1
  // so every existing reader (pipeline, history display) keeps working.
  const hasLines  = Array.isArray(lines) && lines.length > 0
  const firstLine = hasLines ? lines[0] : null

  const ticket = {
    id:                  docRef.id,
    numbers:             hasLines
                           ? [...firstLine.numbers].sort((a, b) => a - b)
                           : [...numbers].sort((a, b) => a - b),
    strongNumber:        hasLines ? firstLine.strongNumber : strongNumber,
    ...(hasLines && { lines }),   // only stored when multi-line
    cost:                cost ?? 70,
    active:              true,
    notes:               notes ?? null,
    createdBy,
    effectiveFromDrawId: effectiveFromDrawId ?? null,
    createdAt:           Timestamp.now(),
    updatedAt:           null,
  }

  await docRef.set(ticket)
  return ticket
}

export async function getActiveWeeklyTicket() {
  if (!isFirestoreReady()) return null
  const snap = await getDb()
    .collection(COLLECTION)
    .where('active', '==', true)
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0].data()
}

export async function deactivateAllWeeklyTickets() {
  if (!isFirestoreReady()) return
  const snap = await getDb()
    .collection(COLLECTION)
    .where('active', '==', true)
    .get()
  if (snap.empty) return
  const batch = getDb().batch()
  snap.docs.forEach(d => batch.update(d.ref, { active: false, updatedAt: Timestamp.now() }))
  await batch.commit()
  console.log(`[WeeklyTicketRepo] Deactivated ${snap.size} weekly ticket(s)`)
}

export async function getWeeklyTicketHistory(limit = 20) {
  if (!isFirestoreReady()) return []
  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getWeeklyTicketById(id) {
  if (!isFirestoreReady()) return null
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  return snap.exists ? snap.data() : null
}

export async function updateWeeklyTicket(id, patch) {
  if (!isFirestoreReady()) return
  await getDb().collection(COLLECTION).doc(id).update({ ...patch, updatedAt: Timestamp.now() })
}
