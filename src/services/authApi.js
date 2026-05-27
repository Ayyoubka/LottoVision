const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'

async function request(path, options = {}) {
  const res  = await fetch(`${BACKEND_URL}${path}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message ?? `Server error ${res.status}`)
  return body
}

/**
 * Create a Firestore user profile for a freshly registered Firebase Auth user.
 * @param {string} idToken  Firebase ID token
 * @param {string} fullName
 */
export function registerProfile(idToken, fullName) {
  return request('/api/auth/register', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fullName }),
  })
}

/**
 * Fetch the Firestore profile for the currently authenticated user.
 * Throws with a 404-shaped error if no profile exists yet.
 * @param {string} idToken  Firebase ID token
 */
export function fetchProfile(idToken) {
  return request('/api/auth/me', {
    headers: { Authorization: `Bearer ${idToken}` },
  })
}
