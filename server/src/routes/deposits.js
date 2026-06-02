/**
 * Deposits routes — authenticated users only.
 *
 * POST /api/deposits        — record a cash deposit for a member
 * GET  /api/deposits        — recent deposit history (all members)
 */

import { Router }           from 'express'
import { verifyToken }      from '../middleware/verifyToken.js'
import { requireAdmin }     from '../middleware/requireAdmin.js'
import { saveDeposit, getRecentDeposits } from '../repositories/depositsRepository.js'
import { applyDeposit, getActiveMembers } from '../repositories/groupMembersRepository.js'

const router = Router()
router.use(verifyToken)

// ── POST /api/deposits ─────────────────────────────────────────────────────
/**
 * Record a cash deposit, update member balance and totalDeposited.
 *
 * Body: { memberId, memberName, amount, note? }
 *
 * Response 201:
 * {
 *   deposit: DepositDocument,
 *   members: MemberDocument[]   ← refreshed list for immediate UI update
 * }
 */
router.post('/', requireAdmin, async (req, res) => {
  const { memberId, memberName, amount, note } = req.body ?? {}

  console.log(`[POST /api/deposits] uid=${req.uid}  memberId=${memberId}  amount=${amount}`)

  // ── Validate ──────────────────────────────────────────────────────────────
  const errors = []
  if (!memberId || typeof memberId !== 'string')
    errors.push('memberId is required')
  if (!memberName || typeof memberName !== 'string')
    errors.push('memberName is required')
  if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount))
    errors.push('amount must be a positive number')
  if (note !== undefined && note !== null && typeof note !== 'string')
    errors.push('note must be a string or null')

  if (errors.length) {
    return res.status(400).json({ error: 'VALIDATION_FAILED', details: errors })
  }

  try {
    // 1. Atomic balance + totalDeposited update on member
    await applyDeposit(memberId, amount)

    // 2. Persist deposit record
    const deposit = await saveDeposit({
      memberId,
      memberName,
      amount,
      note: note?.trim() || null,
      createdBy: req.uid,
    })

    // 3. Return refreshed member list so frontend can update balances immediately
    const members = await getActiveMembers()

    console.log(
      `[POST /api/deposits] deposit saved  id=${deposit?.id}` +
      `  member=${memberName}  amount=₪${amount}`
    )

    res.status(201).json({ deposit, members })
  } catch (err) {
    console.error(`[POST /api/deposits] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/deposits ──────────────────────────────────────────────────────
/**
 * Fetch recent deposits across all members, newest first.
 * Query: ?limit=30 (default 30, max 100)
 *
 * Response 200: { deposits: DepositDocument[] }
 */
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '30', 10), 100)
  try {
    const deposits = await getRecentDeposits(limit)
    res.json({ deposits })
  } catch (err) {
    console.error(`[GET /api/deposits] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

export default router
