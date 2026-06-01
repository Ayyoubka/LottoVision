/**
 * Business logic for admin-managed weekly group tickets.
 *
 * Two-layer design:
 *   weekly_tickets  — admin definition layer (numbers, cost, notes, history)
 *   tickets         — execution layer (draw instances, prize results, settlement links)
 *
 * When a weekly ticket is created or re-activated, a matching entry is written
 * to the tickets collection (active: true) so the pipeline can find it.
 */

import {
  saveWeeklyTicket,
  getActiveWeeklyTicket,
  deactivateAllWeeklyTickets,
  getWeeklyTicketHistory,
  getWeeklyTicketById,
  updateWeeklyTicket,
} from '../repositories/weeklyTicketRepository.js'
import { archiveActiveTickets, saveTicket } from '../repositories/ticketRepository.js'
import { isFirestoreReady }                  from '../config/firestore.js'

// ── Validation ─────────────────────────────────────────────────────────────

function validate({ numbers, strongNumber }) {
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

function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0)
    return 'At least one line is required'
  if (lines.length > 14)
    return 'Maximum 14 lines allowed'
  for (let i = 0; i < lines.length; i++) {
    const err = validate({ numbers: lines[i].numbers, strongNumber: lines[i].strongNumber })
    if (err) return `Line ${i + 1}: ${err}`
  }
  return null
}

function guardFirestore() {
  if (!isFirestoreReady())
    throw Object.assign(new Error('Firestore not available'), { code: 'FIRESTORE_UNAVAILABLE' })
}

// ── Service functions ──────────────────────────────────────────────────────

/**
 * Create a new active weekly ticket.
 * - Deactivates any existing active weekly_ticket
 * - Archives any active tickets entry
 * - Writes to both collections
 *
 * @returns {{ weeklyTicket, ticket }}
 */
export async function createGroupWeeklyTicket({
  numbers, strongNumber, lines, cost, notes, createdBy, effectiveFromDrawId,
}) {
  guardFirestore()

  const hasLines = Array.isArray(lines) && lines.length > 0

  if (hasLines) {
    const err = validateLines(lines)
    if (err) throw Object.assign(new Error(err), { code: 'VALIDATION_ERROR' })
  } else {
    const err = validate({ numbers, strongNumber })
    if (err) throw Object.assign(new Error(err), { code: 'VALIDATION_ERROR' })
  }

  await deactivateAllWeeklyTickets()
  await archiveActiveTickets()

  const normalised = hasLines
    ? { lines: lines.map(l => ({ numbers: [...l.numbers].sort((a, b) => a - b), strongNumber: Number(l.strongNumber) })) }
    : { numbers: numbers.map(Number), strongNumber: Number(strongNumber) }

  const weeklyTicket = await saveWeeklyTicket({
    ...normalised,
    cost:                cost != null ? Number(cost) : 70,
    notes:               notes ?? null,
    createdBy,
    effectiveFromDrawId: effectiveFromDrawId != null ? Number(effectiveFromDrawId) : null,
  })

  const ticket = await saveTicket({
    uid:    createdBy,
    drawId: effectiveFromDrawId != null ? Number(effectiveFromDrawId) : null,
    ...normalised,
    active: true,
    cost:   cost != null ? Number(cost) : 70,
  })

  console.log(
    `[WeeklyTicketService] Created weekly_ticket ${weeklyTicket.id}` +
    `  ticket=${ticket.id}  by=${createdBy}` +
    `  lines=${hasLines ? lines.length : 1}  cost=₪${weeklyTicket.cost}`
  )

  return { weeklyTicket, ticket }
}

/**
 * Partially update a weekly ticket's editable fields.
 * If numbers or strongNumber change, validation is re-run.
 */
export async function patchGroupWeeklyTicket(id, { numbers, strongNumber, lines, cost, notes }) {
  guardFirestore()

  const existing = await getWeeklyTicketById(id)
  if (!existing) throw Object.assign(new Error('Ticket not found'), { code: 'NOT_FOUND' })

  const patch = {}

  if (Array.isArray(lines) && lines.length > 0) {
    const err = validateLines(lines)
    if (err) throw Object.assign(new Error(err), { code: 'VALIDATION_ERROR' })
    const normalised = lines.map(l => ({ numbers: [...l.numbers].sort((a, b) => a - b), strongNumber: Number(l.strongNumber) }))
    patch.lines        = normalised
    patch.numbers      = normalised[0].numbers
    patch.strongNumber = normalised[0].strongNumber
  } else if (numbers !== undefined || strongNumber !== undefined) {
    const n   = numbers !== undefined ? numbers.map(Number) : existing.numbers
    const s   = strongNumber !== undefined ? Number(strongNumber) : existing.strongNumber
    const err = validate({ numbers: n, strongNumber: s })
    if (err) throw Object.assign(new Error(err), { code: 'VALIDATION_ERROR' })
    if (numbers !== undefined)      patch.numbers      = [...n].sort((a, b) => a - b)
    if (strongNumber !== undefined) patch.strongNumber = s
  }

  if (cost  !== undefined) patch.cost  = Number(cost)
  if (notes !== undefined) patch.notes = notes

  await updateWeeklyTicket(id, patch)
  return getWeeklyTicketById(id)
}

/**
 * Re-activate a ticket from history.
 * Deactivates all others and creates a fresh tickets entry.
 */
export async function activateGroupWeeklyTicket(id, createdBy) {
  guardFirestore()

  const existing = await getWeeklyTicketById(id)
  if (!existing) throw Object.assign(new Error('Ticket not found'), { code: 'NOT_FOUND' })

  await deactivateAllWeeklyTickets()
  await archiveActiveTickets()

  await updateWeeklyTicket(id, { active: true })

  const ticket = await saveTicket({
    uid:          createdBy,
    drawId:       null,
    numbers:      existing.numbers,
    strongNumber: existing.strongNumber,
    lines:        existing.lines ?? null,
    active:       true,
    cost:         existing.cost,
  })

  console.log(`[WeeklyTicketService] Re-activated weekly_ticket ${id}  new ticket ${ticket.id}`)
  return { weeklyTicket: { ...existing, active: true }, ticket }
}

/**
 * Deactivate the weekly ticket (admin override — no active ticket until next one created).
 */
export async function deactivateGroupWeeklyTicket(id) {
  guardFirestore()
  const existing = await getWeeklyTicketById(id)
  if (!existing) throw Object.assign(new Error('Ticket not found'), { code: 'NOT_FOUND' })
  await updateWeeklyTicket(id, { active: false })
  await archiveActiveTickets()
  console.log(`[WeeklyTicketService] Deactivated weekly_ticket ${id}`)
  return { ...existing, active: false }
}

export { getActiveWeeklyTicket, getWeeklyTicketHistory }
