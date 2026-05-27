/**
 * Frontend pipeline API client.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

async function authFetch(path, idToken, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      Accept:         'application/json',
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${idToken}`,
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Server error ${res.status}`)
  }
  return res.json()
}

/**
 * Trigger the full weekly pipeline.
 * Idempotent — safe to call multiple times.
 * @returns {Promise<PipelineResult>}
 */
export async function runPipeline(idToken) {
  return authFetch('/api/pipeline/run-latest', idToken, { method: 'POST' })
}

/**
 * Fetch the last pipeline run result (persisted across refreshes).
 * @returns {Promise<{ status: PipelineResult|null }>}
 */
export async function fetchPipelineStatus(idToken) {
  return authFetch('/api/pipeline/status', idToken)
}

/**
 * Fetch pipeline run history (newest first).
 * @param {string} idToken
 * @param {number} [limit=20]
 * @returns {Promise<{ runs: Object[] }>}
 */
export async function fetchPipelineHistory(idToken, limit = 20) {
  return authFetch(`/api/pipeline/history?limit=${limit}`, idToken)
}
