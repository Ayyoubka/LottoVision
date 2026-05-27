/**
 * Frontend client for the notifications API.
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

/**
 * Fetch notification channel status + last success/failure per channel.
 * @returns {Promise<{ channels: { telegram: ChannelStatus } }>}
 */
export async function fetchNotificationStatus(idToken) {
  return authFetch('/api/notifications/status', idToken)
}

/**
 * Send a test notification to all configured channels.
 * @returns {Promise<{ results: { channel, ok, error? }[] }>}
 */
export async function sendTestNotification(idToken) {
  return authFetch('/api/notifications/test', idToken, { method: 'POST' })
}

/**
 * Fetch recent notification logs.
 * @returns {Promise<{ logs: NotificationLog[] }>}
 */
export async function fetchNotificationLogs(idToken, limit = 20) {
  return authFetch(`/api/notifications/logs?limit=${limit}`, idToken)
}
