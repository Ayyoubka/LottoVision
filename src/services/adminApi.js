/**
 * Frontend client for the admin draw import API.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

/**
 * Import a draw result and run settlement.
 *
 * @param {string} idToken  Firebase ID token
 * @param {{
 *   drawId:       number,
 *   date:         string,   // "DD/MM/YYYY"
 *   numbers:      number[],
 *   strongNumber: number,
 *   prizes:       Record<string, number>
 * }} data
 */
export async function importDraw(idToken, data) {
  const res = await fetch(`${BACKEND_URL}/api/admin/import-draw`, {
    method:  'POST',
    headers: {
      Accept:         'application/json',
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${idToken}`,
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg  = body.details
      ? body.details.join('\n')
      : (body.message ?? body.error ?? `Server error ${res.status}`)
    throw new Error(msg)
  }

  return res.json()
}
