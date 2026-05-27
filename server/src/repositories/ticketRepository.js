/**
 * Data-access layer for the `tickets` Firestore collection.
 *
 * Collection schema  tickets/{auto-id}
 * ─────────────────────────────────────────────────────────────────────
 *  id            string     Firestore document ID
 *  uid           string     Firebase Auth uid of the owner
 *  drawId        number|null  the draw this ticket is entered for (null = not yet assigned)
 *  numbers       number[]   6 sorted main numbers (1–37)
 *  strongNumber  number     1–7
 *  createdAt     Timestamp
 *
 *  — Status & results —
 *  checked       boolean    has this ticket been checked against its draw?
 *  matchedCount  number     main numbers matched (0–6)
 *  matchedStrong boolean    strong number matched?
 *  winnings      number     prize amount in ILS (0 until checked)
 *  status        string     'pending' | 'won' | 'lost' | 'checked'
 *
 *  — Future-ready —
 *  groupId       null       reserved for group/split ticket support
 *  prizeClass    null       1–8 once checked (null until then)
 *  prizeLabel    null       'Class 1 · Jackpot' etc. (null until checked)
 *  drawDate      null       DD/MM/YYYY of the relevant draw (null until linked)
 *
 * Required Firestore index:
 *   tickets: uid ASC + createdAt DESC   ← getUserTickets composite query
 *   (Firestore will error on first query with a direct link to create the index)
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const COLLECTION = 'tickets'

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Persist a new ticket document. Returns the saved ticket with its generated id.
 */
export async function saveTicket({ uid, drawId, numbers, strongNumber, active = false, cost = null }) {
  const db     = getDb()
  const docRef = db.collection(COLLECTION).doc()

  const ticket = {
    id:           docRef.id,
    uid,
    drawId:       drawId ?? null,
    numbers:      [...numbers].sort((a, b) => a - b),
    strongNumber,
    createdAt:    Timestamp.now(),

    checked:      false,
    matchedCount: 0,
    matchedStrong:false,
    winnings:     0,
    status:       'pending',

    // Active weekly ticket marker
    active,
    cost,           // total group cost for this week (ILS), null = use default

    groupId:      null,
    prizeClass:   null,
    prizeLabel:   null,
    drawDate:     null,
  }

  await docRef.set(ticket)
  return ticket
}

// ── Active ticket ──────────────────────────────────────────────────────────

/**
 * Return the ticket currently marked as the group's active weekly ticket.
 */
export async function getActiveTicket() {
  if (!isFirestoreReady()) return null
  const snap = await getDb()
    .collection(COLLECTION)
    .where('active', '==', true)
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0].data()
}

/**
 * Set all currently-active tickets to active: false (batch write).
 * Called before saving a new weekly ticket.
 */
export async function archiveActiveTickets() {
  if (!isFirestoreReady()) return
  const snap = await getDb()
    .collection(COLLECTION)
    .where('active', '==', true)
    .get()
  if (snap.empty) return
  const batch = getDb().batch()
  snap.docs.forEach(d => batch.update(d.ref, { active: false }))
  await batch.commit()
  console.log(`[TicketRepo] Archived ${snap.size} previously-active ticket(s)`)
}

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * Fetch all tickets belonging to a user, newest first.
 * Requires composite Firestore index on (uid ASC, createdAt DESC).
 * On first run Firestore will throw with a link to create the index.
 */
export async function getUserTickets(uid) {
  if (!isFirestoreReady()) return []

  try {
    const snap = await getDb()
      .collection(COLLECTION)
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()

    return snap.docs.map(d => d.data())
  } catch (err) {
    // Surface the Firebase Console index-creation link so the developer can act immediately
    if (err.message?.includes('index') || err.code === 9) {
      const linkMatch = err.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)
      const hint      = linkMatch
        ? ` Create it at: ${linkMatch[0]}`
        : ' Go to Firebase Console → Firestore → Indexes.'
      const wrapped   = new Error(`Composite index required for tickets query.${hint}`)
      wrapped.code    = 'INDEX_REQUIRED'
      throw wrapped
    }
    throw err
  }
}

/**
 * Fetch a single ticket by its Firestore document ID.
 */
export async function getTicketById(ticketId) {
  if (!isFirestoreReady()) return null
  const snap = await getDb().collection(COLLECTION).doc(ticketId).get()
  return snap.exists ? snap.data() : null
}

// ── Update ─────────────────────────────────────────────────────────────────

/**
 * Write prize-check results back to a ticket document.
 *
 * Fields written:
 *   checked, checkedAt, matchedCount, matchedStrong,
 *   tier, prizeClass, prizeLabel, winnings, status, drawDate
 *
 * status is derived here: 'won' (winnings > 0) | 'lost' (winnings === 0)
 *
 * Future: when group-split is implemented, split winnings before calling this.
 */
// ── Pipeline queries (no uid filter — admin/system use only) ──────────────

/**
 * Find the first pending ticket linked to a specific draw.
 * Used by the pipeline to locate the active group ticket.
 */
export async function getPendingTicketForDraw(drawId) {
  if (!isFirestoreReady()) return null
  const snap = await getDb()
    .collection(COLLECTION)
    .where('drawId', '==', drawId)
    .get()
  const tickets = snap.docs.map(d => d.data())
  return tickets.find(t => t.status === 'pending') ?? null
}

/**
 * Find the most recently created pending ticket, regardless of drawId.
 * Fallback for auto-linking when no ticket has the draw set yet.
 */
export async function getLatestPendingTicket() {
  if (!isFirestoreReady()) return null
  const snap = await getDb()
    .collection(COLLECTION)
    .where('status', '==', 'pending')
    .get()
  const tickets = snap.docs.map(d => d.data())
  return tickets.sort((a, b) =>
    (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
  )[0] ?? null
}

/**
 * Set (or update) the drawId on an existing ticket document.
 */
export async function linkTicketToDraw(ticketId, drawId) {
  if (!isFirestoreReady()) return
  await getDb().collection(COLLECTION).doc(ticketId).update({ drawId })
}

export async function updateTicketCheckResult(ticketId, {
  matchedCount,
  matchedStrong,
  tier,
  prizeClass,
  prizeLabel,
  winnings,
  drawDate,
}) {
  if (!isFirestoreReady()) return

  await getDb().collection(COLLECTION).doc(ticketId).update({
    checked:      true,
    checkedAt:    Timestamp.now(),
    matchedCount,
    matchedStrong,
    tier:         tier       ?? null,
    prizeClass:   prizeClass ?? null,
    prizeLabel:   prizeLabel ?? null,
    winnings:     winnings   ?? 0,
    status:       winnings > 0 ? 'won' : 'lost',
    drawDate:     drawDate   ?? null,
  })
}
