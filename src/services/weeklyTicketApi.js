/**
 * Frontend client for the weekly_tickets admin API.
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
    throw new Error(body.message ?? body.error ?? `Server error ${res.status}`)
  }
  return res.json()
}

/** @returns {Promise<{ ticket: WeeklyTicket|null }>} */
export async function fetchActiveWeeklyTicket(idToken) {
  return authFetch('/api/tickets/weekly/active', idToken)
}

/** @returns {Promise<{ tickets: WeeklyTicket[] }>} */
export async function fetchWeeklyTicketHistory(idToken, limit = 20) {
  return authFetch(`/api/tickets/weekly/history?limit=${limit}`, idToken)
}

/**
 * Create a new active weekly ticket.
 * @param {{ numbers, strongNumber, cost?, notes?, effectiveFromDrawId? }} data
 * @returns {Promise<{ weeklyTicket: WeeklyTicket, ticket: object }>}
 */
export async function createWeeklyGroupTicket(idToken, data) {
  return authFetch('/api/tickets/weekly', idToken, {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

/**
 * Partially update a weekly ticket.
 * @param {{ numbers?, strongNumber?, cost?, notes? }} patch
 */
export async function updateWeeklyGroupTicket(idToken, id, patch) {
  return authFetch(`/api/tickets/weekly/${id}`, idToken, {
    method: 'PATCH',
    body:   JSON.stringify(patch),
  })
}

/** Re-activate a ticket from history. */
export async function activateWeeklyGroupTicket(idToken, id) {
  return authFetch(`/api/tickets/weekly/${id}/activate`, idToken, { method: 'POST' })
}

/** Deactivate the current active ticket. */
export async function deactivateWeeklyGroupTicket(idToken, id) {
  return authFetch(`/api/tickets/weekly/${id}/deactivate`, idToken, { method: 'POST' })
}
