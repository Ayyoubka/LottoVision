/**
 * Business logic layer for user tickets.
 * Validates input, delegates persistence to ticketRepository.
 */

import { saveTicket, getUserTickets, getTicketById, updateTicketCheckResult, archiveActiveTickets } from '../repositories/ticketRepository.js'
import { getDraw }             from './drawRepository.js'
import { compareTicketToDraw } from './prizeEngine.js'
import { runSettlement }       from './settlementService.js'
import { getPrizeTable }       from '../repositories/prizeTableRepository.js'
import { isFirestoreReady }    from '../config/firestore.js'

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Returns a human-readable error string, or null if the input is valid.
 */
function validateTicketInput({ numbers, strongNumber }) {
  if (!Array.isArray(numbers) || numbers.length !== 6)
    return 'Exactly 6 main numbers are required'

  const nums = numbers.map(Number)

  if (nums.some(n => !Number.isInteger(n) || n < 1 || n > 37))
    return 'All main numbers must be between 1 and 37'

  if (new Set(nums).size !== 6)
    return 'All 6 numbers must be unique'

  const strong = Number(strongNumber)
  if (!Number.isInteger(strong) || strong < 1 || strong > 7)
    return 'Strong number must be between 1 and 7'

  return null
}

// ── Service functions ──────────────────────────────────────────────────────

/**
 * Validate and save a new ticket for the authenticated user.
 * @returns {Promise<object>} The saved ticket document
 * @throws  VALIDATION_ERROR | FIRESTORE_UNAVAILABLE
 */
export async function createTicket({ uid, drawId, numbers, strongNumber }) {
  if (!isFirestoreReady()) {
    throw Object.assign(new Error('Firestore not available'), { code: 'FIRESTORE_UNAVAILABLE' })
  }

  const validationError = validateTicketInput({ numbers, strongNumber })
  if (validationError) {
    throw Object.assign(new Error(validationError), { code: 'VALIDATION_ERROR' })
  }

  const ticket = await saveTicket({
    uid,
    drawId:       drawId != null ? Number(drawId) : null,
    numbers:      numbers.map(Number),
    strongNumber: Number(strongNumber),
  })

  console.log(
    `[TicketService] Saved ticket ${ticket.id}` +
    `  uid=${uid}  numbers=[${ticket.numbers.join(',')}]  strong=${ticket.strongNumber}` +
    `  drawId=${ticket.drawId ?? 'none'}`
  )

  return ticket
}

/**
 * Create the group's active weekly ticket.
 * Archives any previously active ticket first (batch write).
 *
 * @param {{ uid, drawId?, numbers, strongNumber, cost? }}
 * @throws VALIDATION_ERROR | FIRESTORE_UNAVAILABLE
 */
export async function createWeeklyTicket({ uid, drawId, numbers, strongNumber, cost }) {
  if (!isFirestoreReady()) {
    throw Object.assign(new Error('Firestore not available'), { code: 'FIRESTORE_UNAVAILABLE' })
  }

  const validationError = validateTicketInput({ numbers, strongNumber })
  if (validationError) {
    throw Object.assign(new Error(validationError), { code: 'VALIDATION_ERROR' })
  }

  await archiveActiveTickets()

  const ticket = await saveTicket({
    uid,
    drawId:       drawId != null ? Number(drawId) : null,
    numbers:      numbers.map(Number),
    strongNumber: Number(strongNumber),
    active:       true,
    cost:         cost != null ? Number(cost) : null,
  })

  console.log(
    `[TicketService] Weekly ticket ${ticket.id}  active=true` +
    `  cost=${ticket.cost != null ? `₪${ticket.cost}` : 'default'}` +
    `  drawId=${ticket.drawId ?? 'none'}`
  )

  return ticket
}

/**
 * Load a ticket, verify ownership, run the prize engine against its draw,
 * and persist the result back to Firestore.
 *
 * Future — automatic checking after draw import:
 *   Skip the ownership check (uid param) and run this for every pending ticket
 *   whose drawId matches the newly imported draw. A Cloud Function triggered by
 *   a Firestore write to draws/{drawId} is the natural entry point.
 *
 * @param {string} ticketId  Firestore document ID
 * @param {string} uid       Firebase Auth uid of the requesting user
 * @returns {Promise<{ ticket: object, result: object }>}
 * @throws  FIRESTORE_UNAVAILABLE | TICKET_NOT_FOUND | FORBIDDEN |
 *          MISSING_DRAW_ID | DRAW_NOT_FOUND
 */
export async function checkTicket(ticketId, uid) {
  if (!isFirestoreReady()) {
    throw Object.assign(new Error('Firestore not available'), { code: 'FIRESTORE_UNAVAILABLE' })
  }

  // ── 1. Load ticket ────────────────────────────────────────────────────────
  console.log(`[TicketService] checkTicket — ticketId=${ticketId}  uid=${uid}`)

  const ticket = await getTicketById(ticketId)

  if (!ticket) {
    console.warn(`[TicketService] Ticket ${ticketId} not found`)
    throw Object.assign(new Error(`Ticket ${ticketId} not found`), { code: 'TICKET_NOT_FOUND' })
  }

  console.log(
    `[TicketService] Loaded ticket: drawId=${ticket.drawId}` +
    `  numbers=[${ticket.numbers.join(',')}]  strong=${ticket.strongNumber}` +
    `  status=${ticket.status}  checked=${ticket.checked}`
  )

  // ── 2. Ownership check ────────────────────────────────────────────────────
  if (ticket.uid !== uid) {
    console.warn(`[TicketService] Forbidden — ticket.uid=${ticket.uid}  req.uid=${uid}`)
    throw Object.assign(new Error('You do not own this ticket'), { code: 'FORBIDDEN' })
  }

  // ── 3. Draw ID must be set ────────────────────────────────────────────────
  if (!ticket.drawId) {
    console.warn(`[TicketService] Ticket ${ticketId} has no drawId — cannot check`)
    throw Object.assign(
      new Error('Ticket has no draw linked. Set drawId before checking.'),
      { code: 'MISSING_DRAW_ID' }
    )
  }

  // ── 4. Load the draw ──────────────────────────────────────────────────────
  console.log(`[TicketService] Loading draw #${ticket.drawId} from Firestore …`)
  const draw = await getDraw(ticket.drawId)

  if (!draw) {
    console.warn(`[TicketService] Draw #${ticket.drawId} not found in Firestore`)
    throw Object.assign(
      new Error(`Draw #${ticket.drawId} not found. Run /api/scrape/latest to import it first.`),
      { code: 'DRAW_NOT_FOUND' }
    )
  }

  console.log(
    `[TicketService] Loaded draw #${draw.drawId} (${draw.date})` +
    `  numbers=[${draw.numbers.join(',')}]  strong=${draw.strongNumber}`
  )

  // ── 5. Run prize engine ───────────────────────────────────────────────────

  // Fetch per-draw prize table (null = use hardcoded amounts in prizeEngine)
  const prizeTable = await getPrizeTable(draw.drawId)
  if (prizeTable) {
    console.log(`[TicketService] Using dynamic prize table for draw #${draw.drawId}`)
  }

  // Normalise to lines array — multi-line if ticket.lines exists, else single-line
  const lines = (Array.isArray(ticket.lines) && ticket.lines.length > 0)
    ? ticket.lines
    : [{ numbers: ticket.numbers, strongNumber: ticket.strongNumber }]

  const linesResults  = lines.map((line, i) => ({
    lineNumber: i + 1,
    ...compareTicketToDraw(line, draw, prizeTable),
  }))
  const totalWinnings = linesResults.reduce((sum, r) => sum + r.winnings, 0)

  // Winning lines only — stored in the settlement record for history display
  const linesBreakdown = linesResults
    .filter(r => r.winnings > 0)
    .map(({ lineNumber, matchedCount, matchedStrong, tier, prizeLabel, winnings }) => ({
      lineNumber, matchedCount, matchedStrong, tier: tier ?? null, prizeLabel: prizeLabel ?? null, winnings,
    }))

  // Use the best-winning line's metadata for the top-level ticket fields
  // (backward compatible: single-line tickets behave exactly as before)
  const best = linesResults.reduce((a, b) => b.winnings > a.winnings ? b : a, linesResults[0])

  // ── 6. Persist result ─────────────────────────────────────────────────────
  await updateTicketCheckResult(ticketId, {
    matchedCount:  best.matchedCount,
    matchedStrong: best.matchedStrong,
    tier:          best.tier,
    prizeClass:    best.prizeClass,
    prizeLabel:    best.prizeLabel,
    winnings:      totalWinnings,
    drawDate:      draw.date,
    linesResults:  lines.length > 1
      ? linesResults.map(r => ({ tier: r.tier ?? null, winnings: r.winnings }))
      : undefined,
  })

  // ── 7. Run weekly settlement (non-fatal, idempotent) ───────────────────────
  try {
    await runSettlement({
      ticketId,
      drawId:        draw.drawId,
      winnings:      totalWinnings,
      linesBreakdown,                               // stored in settlement record
      ...(ticket.cost != null ? { ticketCost: ticket.cost } : {}),
    })
    console.log(`[TicketService] Settlement complete for draw #${draw.drawId}`)
  } catch (settleErr) {
    if (settleErr.code === 'ALREADY_SETTLED') {
      console.log(`[TicketService] Settlement already ran for draw #${draw.drawId} — skipping`)
    } else {
      console.error(`[TicketService] Settlement failed (non-fatal): ${settleErr.message}`)
    }
  }

  const status = totalWinnings > 0 ? 'won' : 'lost'

  console.log(
    `[TicketService] Check complete — ticketId=${ticketId}  lines=${lines.length}` +
    `  status=${status}  totalWinnings=₪${totalWinnings}` +
    `  bestTier=${best.tier ?? 'none'}`
  )

  return {
    ticketId,
    drawId:          draw.drawId,
    drawDate:        draw.date,
    ...best,
    winnings:        totalWinnings,
    linesResults:    linesResults.map(r => ({ tier: r.tier ?? null, winnings: r.winnings })),
    linesBreakdown,  // winning lines — for pipeline result + display
    status,
    checked:         true,
  }
}

/**
 * Fetch all tickets for the authenticated user, newest first.
 * @returns {Promise<object[]>}
 * @throws  FIRESTORE_UNAVAILABLE | INDEX_REQUIRED
 */
export async function getMyTickets(uid) {
  if (!isFirestoreReady()) {
    throw Object.assign(new Error('Firestore not available'), { code: 'FIRESTORE_UNAVAILABLE' })
  }

  const tickets = await getUserTickets(uid)
  console.log(`[TicketService] Fetched ${tickets.length} tickets for uid=${uid}`)
  return tickets
}
