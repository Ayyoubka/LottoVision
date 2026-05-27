/**
 * Notification hub — central dispatcher for all pipeline completion events.
 *
 * Registered channels (added in this file when env vars are present):
 *   - Telegram  (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 *
 * Future channels to add here:
 *   - WhatsApp via Twilio  (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM)
 *   - Web push             (VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)
 *   - Email via SendGrid   (SENDGRID_API_KEY)
 *
 * Adding a new channel:
 *   1. Create server/src/notifications/{channel}Channel.js
 *   2. Import and register its handler below
 *   3. Add env vars to server/.env.example
 */

/** @type {Array<(result: Object) => Promise<void>>} */
const _handlers = []

// ── Register built-in channels ─────────────────────────────────────────────

// Telegram — dynamic import so a missing export or config error never crashes
// the server at startup. Runs once at module load via top-level await.
try {
  const { handlePipelineComplete } = await import('./telegramChannel.js')
  _handlers.push(handlePipelineComplete)
  console.log('[Notifications] Telegram channel registered')
} catch (err) {
  console.warn('[Notifications] Telegram channel not loaded:', err.message)
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Register an additional notification handler.
 * Handlers are called in registration order after every pipeline run.
 * Errors in one handler never block the others.
 *
 * @param {(result: Object) => Promise<void>} fn
 */
export function registerNotificationHandler(fn) {
  _handlers.push(fn)
}

/**
 * Fire all registered handlers with the pipeline result.
 * Never throws — individual handler errors are caught and logged.
 *
 * @param {Object} result  PipelineResult from drawPipelineService
 */
export async function notifyPipelineComplete(result) {
  for (const handler of _handlers) {
    try {
      await handler(result)
    } catch (err) {
      console.error('[Notifications] Handler error:', err.message)
    }
  }
}
