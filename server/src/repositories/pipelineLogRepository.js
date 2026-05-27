/**
 * pipeline_logs collection — one document per pipeline run.
 * Ordered by startedAt descending.
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const COLLECTION = 'pipeline_logs'

/**
 * Append a pipeline run log entry.
 * @param {Object} entry
 */
export async function addPipelineLog(entry) {
  if (!isFirestoreReady()) return
  await getDb().collection(COLLECTION).add({
    ...entry,
    startedAt:  entry.startedAt  instanceof Timestamp ? entry.startedAt  : Timestamp.fromMillis(entry.startedAt),
    finishedAt: entry.finishedAt instanceof Timestamp ? entry.finishedAt : Timestamp.fromMillis(entry.finishedAt),
  })
}

/**
 * Fetch the most recent pipeline run logs.
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
export async function getPipelineHistory(limit = 20) {
  if (!isFirestoreReady()) return []
  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
