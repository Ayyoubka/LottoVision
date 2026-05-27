/**
 * Frontend ticket API client.
 * All calls require a valid Firebase ID token (pass user.getIdToken() result).
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
 * Save a new ticket for the current user.
 * @param {string}   idToken
 * @param {{ numbers: number[], strongNumber: number, drawId?: number|null }} ticket
 * @returns {Promise<object>} Saved ticket document
 */
export async function saveTicket(idToken, { numbers, strongNumber, drawId = null }) {
  return authFetch('/api/tickets', idToken, {
    method: 'POST',
    body:   JSON.stringify({ numbers, strongNumber, drawId }),
  })
}

/**
 * Fetch all tickets for the current user, newest first.
 * @param {string} idToken
 * @returns {Promise<{ tickets: object[], count: number }>}
 */
export async function fetchMyTickets(idToken) {
  return authFetch('/api/tickets/my', idToken)
}

/**
 * Fetch the group's active weekly ticket (active: true), or null.
 * @returns {Promise<{ ticket: object|null }>}
 */
export async function fetchActiveTicket(idToken) {
  return authFetch('/api/tickets/active', idToken)
}

/**
 * Create a new weekly ticket (archives the previous active one).
 * @param {string} idToken
 * @param {{ numbers, strongNumber, drawId?, cost? }} ticket
 * @returns {Promise<object>} Saved ticket document with active: true
 */
export async function createWeeklyTicket(idToken, { numbers, strongNumber, drawId = null, cost = null }) {
  return authFetch('/api/tickets/weekly', idToken, {
    method: 'POST',
    body:   JSON.stringify({ numbers, strongNumber, drawId, cost }),
  })
}
