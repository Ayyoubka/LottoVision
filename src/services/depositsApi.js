/**
 * Frontend client for the deposits API.
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
    throw new Error(body.details?.join('\n') ?? body.message ?? body.error ?? `Server error ${res.status}`)
  }
  return res.json()
}

/**
 * Record a cash deposit for a member.
 * Returns the created deposit record and the refreshed member list.
 *
 * @param {string} idToken
 * @param {{ memberId, memberName, amount, note? }} data
 * @returns {Promise<{ deposit: object, members: object[] }>}
 */
export async function createDeposit(idToken, { memberId, memberName, amount, note }) {
  return authFetch('/api/deposits', idToken, {
    method: 'POST',
    body:   JSON.stringify({ memberId, memberName, amount, note: note || null }),
  })
}

/**
 * Fetch recent deposits across all members, newest first.
 * @param {string} idToken
 * @param {number} [limit=30]
 * @returns {Promise<{ deposits: object[] }>}
 */
export async function fetchDeposits(idToken, limit = 30) {
  return authFetch(`/api/deposits?limit=${limit}`, idToken)
}
