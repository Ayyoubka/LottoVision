/**
 * Data-access layer for pipeline run metadata.
 * Stores the result of the last pipeline execution in settings/lastPipeline.
 * Single doc — always overwritten on each run.
 */

import { getDb, isFirestoreReady } from '../config/firestore.js'
import { Timestamp }               from 'firebase-admin/firestore'

const SETTINGS_COLLECTION = 'settings'
const PIPELINE_DOC        = 'lastPipeline'

export async function saveLastPipelineRun(result) {
  if (!isFirestoreReady()) return
  await getDb()
    .collection(SETTINGS_COLLECTION)
    .doc(PIPELINE_DOC)
    .set({ ...result, ranAt: Timestamp.now() })
}

export async function getLastPipelineRun() {
  if (!isFirestoreReady()) return null
  const snap = await getDb()
    .collection(SETTINGS_COLLECTION)
    .doc(PIPELINE_DOC)
    .get()
  return snap.exists ? snap.data() : null
}
