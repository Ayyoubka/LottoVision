/**
 * Data-access layer for the `notification_logs` Firestore collection.
 *
 * Collection schema  notification_logs/{auto-id}
 * ─────────────────────────────────────────────────────────────────
 *  id          string
 *  channel     string     'telegram' | 'whatsapp' | 'push' | 'email'
 *  type        string     'pipeline_complete' | 'test'
 *  drawId      number|null  used for idempotency check
 *  success     boolean
 *  sentAt      Timestamp
 *  payload     object     message content (for debugging)
 *  error       string|null
 *  messageId   string|null  channel-specific message reference
 *
 * Required composite Firestore index (create if query errors):
 *   notification_logs: channel ASC + drawId ASC + success ASC
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const COLLECTION = 'notification_logs'

/**
 * Append a notification log entry.
 */
export async function addNotificationLog({ channel, type, drawId, success, payload, error, messageId }) {
  if (!isFirestoreReady()) return
  const ref = getDb().collection(COLLECTION).doc()
  await ref.set({
    id:        ref.id,
    channel,
    type,
    drawId:    drawId    ?? null,
    success:   !!success,
    sentAt:    Timestamp.now(),
    payload:   payload   ?? {},
    error:     error     ?? null,
    messageId: messageId ?? null,
  })
}

/**
 * Check whether a successful notification was already sent for this draw + channel.
 * Used to prevent duplicate sends when the pipeline runs multiple times for the same draw.
 */
export async function hasSuccessfulNotification({ drawId, channel }) {
  if (!isFirestoreReady() || drawId == null) return false
  try {
    const snap = await getDb()
      .collection(COLLECTION)
      .where('drawId',  '==', drawId)
      .where('channel', '==', channel)
      .where('success', '==', true)
      .limit(1)
      .get()
    return !snap.empty
  } catch {
    // Index may not exist yet — fail open (don't block sending)
    return false
  }
}

/**
 * Fetch the most recent notification logs, newest first.
 */
export async function getNotificationLogs(limit = 20) {
  if (!isFirestoreReady()) return []
  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('sentAt', 'desc')
    .limit(Math.min(limit, 100))
    .get()
  return snap.docs.map(d => d.data())
}

/**
 * Fetch the most recent log entry for a specific channel.
 */
export async function getLastNotificationByChannel(channel) {
  if (!isFirestoreReady()) return null
  const snap = await getDb()
    .collection(COLLECTION)
    .where('channel', '==', channel)
    .orderBy('sentAt', 'desc')
    .limit(1)
    .get()
  return snap.empty ? null : snap.docs[0].data()
}

/**
 * Fetch the most recent successful + most recent failed log for a channel.
 * Returns { lastSuccess, lastFailure }.
 */
export async function getChannelStatus(channel) {
  if (!isFirestoreReady()) return { lastSuccess: null, lastFailure: null }

  const [successSnap, failSnap] = await Promise.all([
    getDb().collection(COLLECTION)
      .where('channel', '==', channel)
      .where('success', '==', true)
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get(),
    getDb().collection(COLLECTION)
      .where('channel', '==', channel)
      .where('success', '==', false)
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get(),
  ])

  return {
    lastSuccess: successSnap.empty ? null : successSnap.docs[0].data(),
    lastFailure: failSnap.empty    ? null : failSnap.docs[0].data(),
  }
}
