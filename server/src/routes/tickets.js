/**
 * Ticket routes — authenticated users only.
 *
 * All routes require a valid Firebase ID token (Authorization: Bearer <token>).
 * verifyToken attaches req.uid and req.email on success.
 *
 * Future: add PATCH /api/tickets/:id for updating checked/winnings/status
 *         after the automatic draw-checker runs.
 */

import { Router }      from 'express'
import { verifyToken } from '../middleware/verifyToken.js'
import { createTicket, createWeeklyTicket, getMyTickets, checkTicket } from '../services/ticketService.js'
import { getActiveTicket } from '../repositories/ticketRepository.js'

const router = Router()
router.use(verifyToken)

// ── POST /api/tickets ──────────────────────────────────────────────────────
/**
 * Save a new ticket for the authenticated user.
 *
 * Body: { numbers: number[], strongNumber: number, drawId?: number }
 *
 * Response 201: TicketDocument
 * Response 400: { error: 'VALIDATION_ERROR', message }
 * Response 503: { error: 'FIRESTORE_UNAVAILABLE' }
 */
// ── GET /api/tickets/active ────────────────────────────────────────────────
/**
 * Return the group's current active weekly ticket (active: true), or null.
 * Response 200: { ticket: TicketDocument | null }
 */
router.get('/active', async (req, res) => {
  console.log(`[GET /api/tickets/active] uid=${req.uid}`)
  try {
    const ticket = await getActiveTicket()
    res.json({ ticket })
  } catch (err) {
    console.error(`[GET /api/tickets/active] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/tickets/weekly ───────────────────────────────────────────────
/**
 * Create a new active weekly ticket.
 * Archives the previous active ticket automatically.
 *
 * Body: { numbers, strongNumber, drawId?, cost? }
 * Response 201: TicketDocument (with active: true)
 */
router.post('/weekly', async (req, res) => {
  const { numbers, strongNumber, drawId, cost } = req.body ?? {}

  console.log(
    `[POST /api/tickets/weekly] uid=${req.uid}` +
    `  numbers=${JSON.stringify(numbers)}  strong=${strongNumber}` +
    `  drawId=${drawId ?? 'null'}  cost=${cost ?? 'default'}`
  )

  try {
    const ticket = await createWeeklyTicket({ uid: req.uid, drawId, numbers, strongNumber, cost })
    res.status(201).json(ticket)
  } catch (err) {
    console.error(`[POST /api/tickets/weekly] ${err.message}`)
    if (err.code === 'VALIDATION_ERROR')
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message })
    if (err.code === 'FIRESTORE_UNAVAILABLE')
      return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
    res.status(500).json({ error: 'SAVE_FAILED', message: err.message })
  }
})

// ── POST /api/tickets ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { numbers, strongNumber, drawId } = req.body ?? {}

  console.log(
    `[POST /api/tickets] uid=${req.uid}` +
    `  numbers=${JSON.stringify(numbers)}` +
    `  strong=${strongNumber}` +
    `  drawId=${drawId ?? 'null'}`
  )

  try {
    const ticket = await createTicket({ uid: req.uid, drawId, numbers, strongNumber })
    res.status(201).json(ticket)
  } catch (err) {
    console.error(`[POST /api/tickets] ${err.message}`)
    if (err.code === 'VALIDATION_ERROR')
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message })
    if (err.code === 'FIRESTORE_UNAVAILABLE')
      return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
    res.status(500).json({ error: 'SAVE_FAILED', message: err.message })
  }
})

// ── GET /api/tickets/my ────────────────────────────────────────────────────
/**
 * Return all tickets for the authenticated user, newest first.
 *
 * Response 200: { tickets: TicketDocument[], count: number }
 * Response 503: { error: 'FIRESTORE_UNAVAILABLE' | 'INDEX_REQUIRED', message }
 */
router.get('/my', async (req, res) => {
  console.log(`[GET /api/tickets/my] uid=${req.uid}`)

  try {
    const tickets = await getMyTickets(req.uid)
    res.json({ tickets, count: tickets.length })
  } catch (err) {
    console.error(`[GET /api/tickets/my] ${err.message}`)
    if (err.code === 'FIRESTORE_UNAVAILABLE')
      return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
    if (err.code === 'INDEX_REQUIRED')
      return res.status(503).json({ error: 'INDEX_REQUIRED', message: err.message })
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/tickets/check/:ticketId ─────────────────────────────────────
/**
 * Run the prize engine for one saved ticket against its linked draw.
 * Updates the ticket document in Firestore with the result.
 *
 * The ticket must have a drawId set (saved with one, or manually linked).
 * Only the ticket owner can trigger the check.
 *
 * Future — automatic scheduling:
 *   After syncLatestDraw() imports draw N, fire this for every ticket where
 *   drawId === N and status === 'pending'. Cloud Scheduler or a Firestore
 *   onCreate trigger on draws/{drawId} are both viable entry points.
 *
 * Response 200:
 * {
 *   ticketId:      string,
 *   drawId:        number,
 *   drawDate:      string,        // "DD/MM/YYYY"
 *   matchedNumbers: number[],
 *   matchedCount:  number,        // 0–6
 *   matchedStrong: boolean,
 *   tier:          string|null,   // e.g. "4+s", null = no prize
 *   prizeClass:    number|null,   // 1–8
 *   prizeLabel:    string|null,
 *   winnings:      number,        // ILS, 0 = no prize
 *   isJackpot:     boolean,
 *   status:        "won"|"lost",
 *   checked:       true,
 * }
 *
 * Response 400: { error: 'MISSING_DRAW_ID' }
 * Response 403: { error: 'FORBIDDEN' }
 * Response 404: { error: 'TICKET_NOT_FOUND' | 'DRAW_NOT_FOUND' }
 * Response 503: { error: 'FIRESTORE_UNAVAILABLE' }
 */
router.post('/check/:ticketId', async (req, res) => {
  const { ticketId } = req.params

  console.log(`[POST /api/tickets/check/${ticketId}] uid=${req.uid}`)

  try {
    const checkResult = await checkTicket(ticketId, req.uid)

    console.log(
      `[POST /api/tickets/check/${ticketId}] Result:` +
      `  status=${checkResult.status}` +
      `  tier=${checkResult.tier ?? 'none'}` +
      `  winnings=₪${checkResult.winnings}`
    )

    res.json(checkResult)
  } catch (err) {
    console.error(`[POST /api/tickets/check/${ticketId}] ${err.message}`)

    const statusMap = {
      TICKET_NOT_FOUND:     404,
      DRAW_NOT_FOUND:       404,
      FORBIDDEN:            403,
      MISSING_DRAW_ID:      400,
      FIRESTORE_UNAVAILABLE:503,
    }

    const status = statusMap[err.code] ?? 500
    res.status(status).json({ error: err.code ?? 'CHECK_FAILED', message: err.message })
  }
})

export default router
