/**
 * Notification management routes — authenticated users only.
 *
 * POST /api/notifications/test      — send a test message to all configured channels
 * GET  /api/notifications/status    — connection status + last notification per channel
 * GET  /api/notifications/logs      — recent notification log entries
 */

import { Router }    from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import {
  isTelegramConfigured,
  sendTestMessage,
  verifyTelegramConnection,
} from '../notifications/telegramChannel.js'
import {
  getNotificationLogs,
  getChannelStatus,
} from '../repositories/notificationLogRepository.js'

const router = Router()
router.use(verifyToken)

// ── POST /api/notifications/test ──────────────────────────────────────────
/**
 * Send a test notification to every configured channel.
 * Useful for verifying credentials without running the full pipeline.
 *
 * Response 200: { results: { channel, ok, error? }[] }
 */
router.post('/test', async (req, res) => {
  console.log(`[POST /api/notifications/test] uid=${req.uid}`)

  const results = []

  // Telegram
  if (isTelegramConfigured()) {
    try {
      await sendTestMessage()
      results.push({ channel: 'telegram', ok: true })
    } catch (err) {
      results.push({ channel: 'telegram', ok: false, error: err.message })
    }
  } else {
    results.push({ channel: 'telegram', ok: false, error: 'Not configured' })
  }

  res.json({ results })
})

// ── GET /api/notifications/status ─────────────────────────────────────────
/**
 * Returns connection status and last notification for each channel.
 *
 * Response 200:
 * {
 *   channels: {
 *     telegram: {
 *       configured: boolean,
 *       connected:  boolean|null,    // null = not verified
 *       botName:    string|null,
 *       lastSuccess: NotificationLog|null,
 *       lastFailure: NotificationLog|null,
 *     }
 *   }
 * }
 */
router.get('/status', async (req, res) => {
  try {
    const [telegramVerify, telegramStatus] = await Promise.all([
      isTelegramConfigured() ? verifyTelegramConnection() : Promise.resolve({ ok: false }),
      getChannelStatus('telegram'),
    ])

    res.json({
      channels: {
        telegram: {
          configured:  isTelegramConfigured(),
          connected:   telegramVerify.ok,
          botName:     telegramVerify.botName ?? null,
          error:       telegramVerify.error   ?? null,
          lastSuccess: telegramStatus.lastSuccess,
          lastFailure: telegramStatus.lastFailure,
        },
      },
    })
  } catch (err) {
    console.error(`[GET /api/notifications/status] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/notifications/logs ───────────────────────────────────────────
/**
 * Returns the most recent notification log entries, newest first.
 * Query param: ?limit=20 (default 20, max 100)
 *
 * Response 200: { logs: NotificationLog[] }
 */
router.get('/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 100)
  try {
    const logs = await getNotificationLogs(limit)
    res.json({ logs })
  } catch (err) {
    console.error(`[GET /api/notifications/logs] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

export default router
