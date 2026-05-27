/**
 * Frontend Lotto API client.
 *
 * Points to the local Express backend (/server) which scrapes pais.co.il.
 * For production, replace BACKEND_URL with the deployed server URL.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

/**
 * Fetch the latest draw from our Express backend.
 * @returns {Promise<{ drawId: number, date: string, numbers: number[], strongNumber: number }>}
 */
export async function fetchLatestDraw() {
  const res = await fetch(`${BACKEND_URL}/api/latest-draw`, {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Server error ${res.status}`)
  }

  return res.json()
}

/**
 * Fetch 12 statistical ticket recommendations (3 per strategy).
 * @returns {Promise<{ smart, hot, balanced, risky }>}
 */
export async function fetchRecommendations() {
  const res = await fetch(`${BACKEND_URL}/api/recommendations`, {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Server error ${res.status}`)
  }

  return res.json()
}

/**
 * Simulate a ticket against the latest 100 stored draws.
 * @param {number[]} numbers  6 main numbers (1-37)
 * @param {number}   strong   strong number (1-7)
 */
export async function simulateTicket(numbers, strong) {
  const params = new URLSearchParams({
    numbers: numbers.join(','),
    strong:  String(strong),
  })

  const res = await fetch(`${BACKEND_URL}/api/simulate-ticket?${params}`, {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Server error ${res.status}`)
  }

  return res.json()
}
