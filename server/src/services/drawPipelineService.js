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
 * Future: trigger via Cloud Scheduler cron "0 22 * * 2,6" (Tue/Sat 22:00 IL)
 * or as a Firestore onCreate trigger on draws/{drawId}.
 */

import { syncLatestDraw }    from './lottoScraper.js'
import { checkTicket }       from './ticketService.js'
import { runSettlement, GROUP_TICKET_COST } from './settlementService.js'
import {
  getPendingTicketForDraw,
  getLatestPendingTicket,
  linkTicketToDraw,
} from '../repositories/ticketRepository.js'
import { getLatestSettlement }  from '../repositories/settlementsRepository.js'
import { saveLastPipelineRun }  from '../repositories/pipelineRepository.js'

// ── Pipeline ───────────────────────────────────────────────────────────────

/**
 * Run the full weekly pipeline for the latest available draw.
 *
 * @returns {Promise<PipelineResult>}
 */
export async function runLatestPipeline() {
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
  }

  try {
    // ────────────────────────────────────────────────────────────────────────
    // Stage 1 — Scrape & save draw
    // ────────────────────────────────────────────────────────────────────────
    console.log('[Pipeline] ── Stage 1: Scraping latest draw ──')
    const { inserted, draw } = await syncLatestDraw()

    result.drawId   = draw.drawId
    result.drawDate = draw.date

    if (inserted) {
      result.drawInserted = true
      console.log(`[Pipeline] Draw #${draw.drawId} (${draw.date}) inserted`)
    } else {
      result.drawSkipped = true
      console.log(`[Pipeline] Draw #${draw.drawId} already exists — continuing`)
    }

    // ────────────────────────────────────────────────────────────────────────
    // Stage 2 — Find active group ticket
    // ────────────────────────────────────────────────────────────────────────
    console.log(`[Pipeline] ── Stage 2: Finding ticket for draw #${draw.drawId} ──`)
    let ticket = await getPendingTicketForDraw(draw.drawId)

    if (!ticket) {
      const unlinked = await getLatestPendingTicket()
      if (unlinked && !unlinked.drawId) {
        console.log(`[Pipeline] Auto-linking ticket ${unlinked.id} → draw #${draw.drawId}`)
        await linkTicketToDraw(unlinked.id, draw.drawId)
        ticket = { ...unlinked, drawId: draw.drawId }
        result.ticketLinked = true
      }
    }

    if (!ticket) {
      console.log('[Pipeline] No pending ticket found — pipeline stopped at stage 2')
      await persistResult({ ...result, stoppedAt: 'NO_TICKET' })
      return result
    }

    result.ticketFound = true
    console.log(`[Pipeline] Ticket ${ticket.id}  checked=${ticket.checked}  drawId=${ticket.drawId}`)

    // ────────────────────────────────────────────────────────────────────────
    // Stage 3 — Check ticket (prize engine)
    // ────────────────────────────────────────────────────────────────────────
    if (ticket.checked) {
      result.ticketAlreadyChecked = true
      result.winnings = ticket.winnings ?? 0
      console.log(`[Pipeline] ── Stage 3: Ticket already checked  winnings=₪${result.winnings} ──`)
    } else {
      console.log(`[Pipeline] ── Stage 3: Checking ticket ${ticket.id} ──`)
      // checkTicket internally runs settlement — stage 4 is automatic
      const checkResult    = await checkTicket(ticket.id, ticket.uid)
      result.ticketChecked = true
      result.winnings      = checkResult.winnings
      result.settlementCreated = true
      console.log(
        `[Pipeline] Check done  status=${checkResult.status}` +
        `  tier=${checkResult.tier ?? 'none'}  winnings=₪${result.winnings}`
      )
    }

    // ────────────────────────────────────────────────────────────────────────
    // Stage 4 — Settlement (explicit path for already-checked tickets)
    // ────────────────────────────────────────────────────────────────────────
    if (result.ticketAlreadyChecked) {
      console.log(`[Pipeline] ── Stage 4: Settlement for draw #${draw.drawId} ──`)
      try {
        await runSettlement({ ticketId: ticket.id, drawId: draw.drawId, winnings: result.winnings })
        result.settlementCreated = true
        console.log('[Pipeline] Settlement created')
      } catch (e) {
        if (e.code === 'ALREADY_SETTLED') {
          result.settlementSkipped = true
          console.log('[Pipeline] Settlement already exists — skipped')
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
      // Fallback estimate (settlement doc not yet readable — unlikely)
      result.memberDelta = Math.round(((result.winnings - GROUP_TICKET_COST) / 7) * 100) / 100
      result.netResult   = result.winnings - GROUP_TICKET_COST
    }

    console.log(
      `[Pipeline] ── Complete ──  winnings=₪${result.winnings}` +
      `  netResult=₪${result.netResult}  memberDelta=₪${result.memberDelta}`
    )

  } catch (err) {
    result.error = err.message
    console.error(`[Pipeline] Fatal error: ${err.message}`)
  }

  await persistResult(result)
  return result
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function persistResult(result) {
  try {
    await saveLastPipelineRun(result)
  } catch (e) {
    console.error(`[Pipeline] Failed to persist run status: ${e.message}`)
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
 */
