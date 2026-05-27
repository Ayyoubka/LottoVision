/**
 * Frontend settlement API client.
 * All calls require a valid Firebase ID token.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

async function authFetch(path, idToken) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      Accept:        'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Server error ${res.status}`)
  }
  return res.json()
}

/**
 * Fetch all active member balances.
 * Auto-seeds members on first call if collection is empty.
 * @returns {Promise<{ members: object[] }>}
 */
export async function fetchMembers(idToken) {
  return authFetch('/api/settlements/members', idToken)
}

/**
 * Fetch the most recent settlement.
 * @returns {Promise<{ settlement: object|null }>}
 */
export async function fetchLatestSettlement(idToken) {
  return authFetch('/api/settlements/latest', idToken)
}

/**
 * Fetch the last 10 settlements.
 * @returns {Promise<{ settlements: object[] }>}
 */
export async function fetchSettlements(idToken) {
  return authFetch('/api/settlements', idToken)
}

/**
 * Admin override: set a member's balance directly.
 * @param {string} idToken
 * @param {string} memberId  Firestore document ID
 * @param {number} balance   New balance value in ILS
 * @returns {Promise<{ updated: true, members: object[] }>}
 */
export async function updateMemberBalance(idToken, memberId, balance) {
  const res = await fetch(
    `${(import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001')}/api/settlements/members/${memberId}/balance`,
    {
      method:  'PATCH',
      headers: {
        Accept:         'application/json',
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${idToken}`,
      },
      body: JSON.stringify({ balance }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Server error ${res.status}`)
  }
  return res.json()
}
