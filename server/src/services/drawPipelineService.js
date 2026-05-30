/**
 * drawPipelineService.js — full weekly draw-processing pipeline.
 *
 * Stages:
 *   1. Scrape & save latest draw (idempotent — skips if already stored)
 *   2. Find the active group ticket for that draw
 *      → auto-links the most recent unlinked pending ticket if needed
 *   3. Check the ticket against the draw (prize engine)
 *      → skipped if already checked
 *   4. Run group settlement
 *      → automatically triggered inside checkTicket; also called explicitly
 *         when ticket was already checked to handle the idempotent case
 *
 * The entire pipeline is idempotent: calling it multiple times for the same
 * draw produces the same result — no duplicate settlements or balance updates.
 *
 * Scheduler: node-cron "30 22 * * 2,6" Asia/Jerusalem (Tue/Sat 22:30 IL)
 */

import { syncLatestDraw }    from './lottoScraper.js'
import { checkTicket }       from './ticketService.js'
import { runSettlement, GROUP_TICKET_COST } from './settlementService.js'
import {
  getPendingTicketForDraw,
  getLatestPendingTicket,
  linkTicketToDraw,
  saveTicket,
} from '../repositories/ticketRepository.js'
import { getActiveWeeklyTicket }   from '../repositories/weeklyTicketRepository.js'
import { getLatestSettlement }     from '../repositories/settlementsRepository.js'
import { saveLastPipelineRun }     from '../repositories/pipelineRepository.js'
import { addPipelineLog }          from '../repositories/pipelineLogRepository.js'
import { notifyPipelineComplete }  from '../notifications/notificationService.js'

// ── Concurrency lock ───────────────────────────────────────────────────────
// Node.js is single-threaded, so a simple boolean is safe here.
let _running = false

/** True while a pipeline run is in progress. */
export const isPipelineRunning = () => _running

// ── Pipeline ───────────────────────────────────────────────────────────────

/**
 * Run the full weekly pipeline for the latest available draw.
 *
 * @param {'manual'|'scheduler'} source  Who triggered this run
 * @returns {Promise<PipelineResult>}
 */
export async function runLatestPipeline(source = 'manual') {
  if (_running) {
    console.log(`[Pipeline] Already running — skipping ${source} trigger`)
    return { skipped: true, reason: 'ALREADY_RUNNING', source }
  }

  _running = true
  const startedAt = Date.now()

  /** @type {PipelineResult} */
  const result = {
    drawInserted:         false,
    drawSkipped:          false,
    drawId:               null,
    drawDate:             null,
    ticketFound:          false,
    ticketLinked:         false,
    ticketChecked:        false,
    ticketAlreadyChecked: false,
    settlementCreated:    false,
    settlementSkipped:    false,
    winnings:             0,
    netResult:            0,
    memberDelta:          0,
    error:                null,
    source,
  }

  const ts = () => `+${Date.now() - startedAt}ms`

  try {
    // ────────────────────────────────────────────────────────────────────────
    // START
    // ────────────────────────────────────────────────────────────────────────
    console.log(`[Pipeline] ════ START  source=${source}  ${new Date().toISOString()} ════`)

    // ────────────────────────────────────────────────────────────────────────
    // Stage 1 — Fetch draw (scrape pais.co.il or Firestore fallback)
    // ────────────────────────────────────────────────────────────────────────
    console.log(`[Pipeline] [${ts()}] Stage 1 START — fetch draw`)
    const syncResult = await syncLatestDraw()
    const { inserted, draw, fallback } = syncResult

    result.drawId   = draw.drawId
    result.drawDate = draw.date

    if (fallback) {
      result.drawSkipped = true
      console.log(`[Pipeline] [${ts()}] Stage 1 DONE — scrape timed out, using cached draw #${draw.drawId} (${draw.date})`)
    } else if (inserted) {
      result.drawInserted = true
      console.log(`[Pipeline] [${ts()}] Stage 1 DONE — draw #${draw.drawId} (${draw.date}) inserted (scrape: ${syncResult.scrapeMs}ms)`)
    } else {
      result.drawSkipped = true
      console.log(`[Pipeline] [${ts()}] Stage 1 DONE — draw #${draw.drawId} already in Firestore (scrape: ${syncResult.scrapeMs}ms)`)
    }

    // ────────────────────────────────────────────────────────────────────────
    // Stage 2 — Load active ticket
    // ────────────────────────────────────────────────────────────────────────
    console.log(`[Pipeline] [${ts()}] Stage 2 START — load active ticket for draw #${draw.drawId}`)
    let ticket = await getPendingTicketForDraw(draw.drawId)

    if (!ticket) {
      console.log(`[Pipeline] [${ts()}] No ticket linked to draw #${draw.drawId} — checking unlinked pending tickets`)
      const unlinked = await getLatestPendingTicket()
      if (unlinked && !unlinked.drawId) {
        console.log(`[Pipeline] [${ts()}] Auto-linking ticket ${unlinked.id} → draw #${draw.drawId}`)
        await linkTicketToDraw(unlinked.id, draw.drawId)
        ticket = { ...unlinked, drawId: draw.drawId }
        result.ticketLinked = true
      }
    }

    if (!ticket) {
      console.log(`[Pipeline] [${ts()}] No unlinked ticket — checking weekly_ticket definition`)
      const weeklyTicket = await getActiveWeeklyTicket()
      if (weeklyTicket) {
        console.log(`[Pipeline] [${ts()}] Auto-creating ticket from weekly_ticket ${weeklyTicket.id}`)
        ticket = await saveTicket({
          uid:          weeklyTicket.createdBy,
          drawId:       draw.drawId,
          numbers:      weeklyTicket.numbers,
          strongNumber: weeklyTicket.strongNumber,
          active:       false,
          cost:         weeklyTicket.cost,
        })
        result.ticketLinked = true
        console.log(`[Pipeline] [${ts()}] Auto-created ticket ${ticket.id} for draw #${draw.drawId}`)
      }
    }

    if (!ticket) {
      console.log(`[Pipeline] [${ts()}] Stage 2 DONE — no ticket found, pipeline stopped`)
      await persistResult({ ...result, stoppedAt: 'NO_TICKET' })
      return result
    }

    result.ticketFound = true
    console.log(`[Pipeline] [${ts()}] Stage 2 DONE — ticket ${ticket.id}  checked=${ticket.checked}  drawId=${ticket.drawId}`)

    // ────────────────────────────────────────────────────────────────────────
    // Stage 3 — Calculate result (prize engine)
    // ────────────────────────────────────────────────────────────────────────
    if (ticket.checked) {
      result.ticketAlreadyChecked = true
      result.winnings = ticket.winnings ?? 0
      console.log(`[Pipeline] [${ts()}] Stage 3 SKIP — ticket already checked  winnings=₪${result.winnings}`)
    } else {
      console.log(`[Pipeline] [${ts()}] Stage 3 START — checking ticket ${ticket.id} against draw #${draw.drawId}`)
      const checkResult    = await checkTicket(ticket.id, ticket.uid)
      result.ticketChecked = true
      result.winnings      = checkResult.winnings
      result.settlementCreated = true
      console.log(
        `[Pipeline] [${ts()}] Stage 3 DONE — status=${checkResult.status}` +
        `  tier=${checkResult.tier ?? 'none'}  winnings=₪${result.winnings}`
      )
    }

    // ────────────────────────────────────────────────────────────────────────
    // Stage 4 — Save settlement (explicit path for already-checked tickets)
    // ────────────────────────────────────────────────────────────────────────
    if (result.ticketAlreadyChecked) {
      console.log(`[Pipeline] [${ts()}] Stage 4 START — running settlement for draw #${draw.drawId}`)
      try {
        await runSettlement({ ticketId: ticket.id, drawId: draw.drawId, winnings: result.winnings })
        result.settlementCreated = true
        console.log(`[Pipeline] [${ts()}] Stage 4 DONE — settlement created`)
      } catch (e) {
        if (e.code === 'ALREADY_SETTLED') {
          result.settlementSkipped = true
          console.log(`[Pipeline] [${ts()}] Stage 4 SKIP — settlement already exists`)
        } else {
          throw e
        }
      }
    }

    // ── Populate reporting fields from settlement doc ──────────────────────
    const settlement = await getLatestSettlement()
    if (settlement?.drawId === draw.drawId) {
      result.memberDelta = settlement.memberResults?.[0]?.delta ?? 0
      result.netResult   = settlement.netResult
    } else {
      result.memberDelta = Math.round(((result.winnings - GROUP_TICKET_COST) / 7) * 100) / 100
      result.netResult   = result.winnings - GROUP_TICKET_COST
    }

  } catch (err) {
    result.error = err.message
    console.error(`[Pipeline] [${ts()}] FATAL ERROR: ${err.message}`)
  } finally {
    _running = false
    const finishedAt  = Date.now()
    result.durationMs = finishedAt - startedAt

    await persistResult(result)
    await writeLog(result, startedAt, finishedAt)

    // ────────────────────────────────────────────────────────────────────────
    // Stage 5 — Send Telegram notification
    // ────────────────────────────────────────────────────────────────────────
    console.log(`[Pipeline] [${ts()}] Stage 5 START — sending Telegram notification`)
    await notifyPipelineComplete(result)
    console.log(`[Pipeline] [${ts()}] Stage 5 DONE — Telegram notification sent`)

    // ── FINISH ───────────────────────────────────────────────────────────────
    console.log(
      `[Pipeline] ════ FINISH  durationMs=${result.durationMs}` +
      `  drawId=${result.drawId}  winnings=₪${result.winnings}` +
      `  netResult=₪${result.netResult}` +
      `  error=${result.error ?? 'none'} ════`
    )
  }

  return result
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function persistResult(result) {
  try {
    await saveLastPipelineRun({ ...result, durationMs: result.durationMs ?? null })
  } catch (e) {
    console.error(`[Pipeline] Failed to persist run status: ${e.message}`)
  }
}

async function writeLog(result, startedAt, finishedAt) {
  try {
    await addPipelineLog({
      startedAt,
      finishedAt,
      durationMs:        finishedAt - startedAt,
      drawId:            result.drawId,
      drawDate:          result.drawDate,
      inserted:          result.drawInserted,
      checked:           result.ticketChecked || result.ticketAlreadyChecked,
      winnings:          result.winnings,
      netResult:         result.netResult,
      memberDelta:       result.memberDelta,
      settlementCreated: result.settlementCreated,
      settlementSkipped: result.settlementSkipped,
      errors:            result.error ? [result.error] : [],
      source:            result.source ?? 'manual',
    })
  } catch (e) {
    console.error(`[Pipeline] Failed to write pipeline log: ${e.message}`)
  }
}

/**
 * @typedef {Object} PipelineResult
 * @property {boolean} drawInserted
 * @property {boolean} drawSkipped
 * @property {number|null} drawId
 * @property {string|null} drawDate
 * @property {boolean} ticketFound
 * @property {boolean} ticketLinked
 * @property {boolean} ticketChecked
 * @property {boolean} ticketAlreadyChecked
 * @property {boolean} settlementCreated
 * @property {boolean} settlementSkipped
 * @property {number} winnings
 * @property {number} netResult
 * @property {number} memberDelta
 * @property {string|null} error
 * @property {'manual'|'scheduler'} source
 * @property {number} [durationMs]
 */
