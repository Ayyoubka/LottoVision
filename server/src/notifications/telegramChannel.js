/**
 * Telegram notification channel.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN   — from @BotFather
 *   TELEGRAM_CHAT_ID     — numeric chat/group ID (use @userinfobot to find it)
 *
 * Idempotent: will not send twice for the same drawId.
 * Self-contained: handles its own logging and error isolation.
 */

import axios from 'axios'
import { getDraw }                   from '../services/drawRepository.js'
import {
  addNotificationLog,
  hasSuccessfulNotification,
}  from '../repositories/notificationLogRepository.js'

const CHANNEL = 'telegram'

// ── Config ─────────────────────────────────────────────────────────────────

export function isTelegramConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Handler for pipeline completion events.
 * Register this in index.js:
 *   registerNotificationHandler(handlePipelineComplete)
 *
 * Never throws — all errors are caught and logged.
 */
export async function handlePipelineComplete(result) {
  if (!isTelegramConfigured()) return
  if (result.skipped)          return   // pipeline was locked — nothing to report

  // Skip if no meaningful outcome (no draw at all)
  if (!result.drawId) {
    console.log('[Telegram] No drawId in result — skipping notification')
    return
  }

  // Idempotency: don't send twice for the same draw
  const alreadySent = await hasSuccessfulNotification({ drawId: result.drawId, channel: CHANNEL })
  if (alreadySent) {
    console.log(`[Telegram] Already notified for draw #${result.drawId} — skipping`)
    return
  }

  const text = await buildPipelineMessage(result)
  await send({ type: 'pipeline_complete', drawId: result.drawId, text })
}

/**
 * Send a test message (for the admin test route).
 * Always sends regardless of idempotency — it's a test.
 */
export async function sendTestMessage() {
  if (!isTelegramConfigured()) {
    throw new Error('Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID')
  }

  const text = [
    '<b>🔔 LottoVision — Test Notification</b>',
    '',
    '✅ Telegram integration is working correctly.',
    `🕐 Sent at: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' })} (IL time)`,
  ].join('\n')

  return send({ type: 'test', drawId: null, text })
}

/**
 * Verify the bot token is valid by calling getMe.
 * @returns {{ ok: boolean, botName?: string, error?: string }}
 */
export async function verifyTelegramConnection() {
  if (!isTelegramConfigured()) {
    return { ok: false, error: 'Not configured' }
  }
  try {
    const res = await axios.get(apiUrl('getMe'), { timeout: 8000 })
    const bot = res.data.result
    return { ok: true, botName: bot.username, botId: bot.id }
  } catch (err) {
    const msg = err.response?.data?.description ?? err.message
    return { ok: false, error: msg }
  }
}

// ── Message builder ─────────────────────────────────────────────────────────

async function buildPipelineMessage(result) {
  const lines = []

  // ── Header ──────────────────────────────────────────────────────────────
  if (result.drawId) {
    lines.push(`<b>🎰 LottoVision — Draw #${result.drawId}</b>`)
    if (result.drawDate) lines.push(`📅 ${result.drawDate}`)
  } else {
    lines.push('<b>🎰 LottoVision — Pipeline Complete</b>')
  }
  lines.push('')

  // ── Draw numbers (fetch from Firestore) ────────────────────────────────
  if (result.drawId) {
    try {
      const draw = await getDraw(result.drawId)
      if (draw) {
        const nums = draw.numbers.join(' · ')
        lines.push(`🔢 <code>${nums}</code>   🔴 <code>${draw.strongNumber}</code>`)
        lines.push('')
      }
    } catch {
      // non-fatal
    }
  }

  // ── Result ───────────────────────────────────────────────────────────
  if (!result.ticketFound) {
    lines.push('⚠️ <b>No active ticket found</b>')
    lines.push('Set a weekly ticket before the draw.')
  } else if (result.error) {
    lines.push(`❌ <b>Pipeline error</b>`)
    lines.push(`<code>${escapeHtml(result.error)}</code>`)
  } else {
    const won = result.winnings > 0
    lines.push(won
      ? `🏆 <b>Win! ₪${result.winnings.toLocaleString()}</b>`
      : `😔 <b>Lost this round</b>`
    )

    if (result.ticketFound) {
      const netSign = result.netResult >= 0 ? '+' : ''
      lines.push(`   Winnings: ₪${result.winnings.toLocaleString()}  |  Net: ${netSign}₪${result.netResult}`)
    }
    lines.push('')

    // ── Per-member delta ───────────────────────────────────────────────
    if (result.memberDelta !== undefined) {
      const dSign = result.memberDelta >= 0 ? '+' : ''
      lines.push(`💸 Per member: <b>${dSign}₪${result.memberDelta}</b>`)
      lines.push('')
    }

    // ── Member balances from settlement ────────────────────────────────
    if (result.drawId) {
      try {
        const { getSettlementForDraw } = await import('../repositories/settlementsRepository.js')
        const settlement = await getSettlementForDraw(result.drawId)
        if (settlement?.memberResults?.length) {
          lines.push('👥 <b>Balances after settlement:</b>')
          lines.push('<pre>')
          for (const m of settlement.memberResults) {
            const balSign = m.balanceAfter >= 0 ? '+' : ''
            const name    = (m.name ?? '?').padEnd(10)
            const bal     = `${balSign}₪${m.balanceAfter}`
            lines.push(`${name}  ${bal}`)
          }
          lines.push('</pre>')
        }
      } catch {
        // non-fatal
      }
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  lines.push('')
  const src = result.source === 'scheduler' ? '⚡ Auto run' : '🖐 Manual run'
  const dur = result.durationMs ? ` · ${(result.durationMs / 1000).toFixed(1)}s` : ''
  lines.push(`<i>${src}${dur}</i>`)

  return lines.join('\n')
}

// ── Low-level send ──────────────────────────────────────────────────────────

async function send({ type, drawId, text }) {
  const chatId = process.env.TELEGRAM_CHAT_ID

  try {
    const res = await axios.post(
      apiUrl('sendMessage'),
      { chat_id: chatId, text, parse_mode: 'HTML' },
      { timeout: 15_000 }
    )

    const messageId = String(res.data.result?.message_id ?? '')
    console.log(`[Telegram] Sent ${type} message (msgId=${messageId}  drawId=${drawId ?? 'n/a'})`)

    await addNotificationLog({
      channel: CHANNEL, type, drawId, success: true,
      payload: { text: text.slice(0, 400) },
      error: null, messageId,
    })

    return { ok: true, messageId }

  } catch (err) {
    const errMsg = err.response?.data?.description ?? err.message
    console.error(`[Telegram] Send failed: ${errMsg}`)

    await addNotificationLog({
      channel: CHANNEL, type, drawId, success: false,
      payload: { text: text.slice(0, 400) },
      error: errMsg, messageId: null,
    })

    throw new Error(`Telegram send failed: ${errMsg}`)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
