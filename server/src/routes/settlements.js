/**
 * Settlements routes — authenticated users only (admin-only app).
 *
 * GET  /api/settlements/members        — live member balances
 * GET  /api/settlements/latest         — most recent settlement
 * GET  /api/settlements                — last 10 settlements
 * POST /api/settlements/seed-members   — one-time member list init
 */

import { Router }             from 'express'
import { verifyToken }        from '../middleware/verifyToken.js'
import { getActiveMembers, setMemberBalance } from '../repositories/groupMembersRepository.js'
import {
  getLatestSettlement,
  getRecentSettlements,
} from '../repositories/settlementsRepository.js'
import { ensureGroupMembers } from '../services/settlementService.js'

const router = Router()
router.use(verifyToken)

// ── GET /api/settlements/members ───────────────────────────────────────────
router.get('/members', async (req, res) => {
  console.log(`[GET /api/settlements/members] uid=${req.uid}`)
  try {
    await ensureGroupMembers()       // auto-seed on first call
    const members = await getActiveMembers()
    res.json({ members })
  } catch (err) {
    console.error(`[GET /api/settlements/members] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/settlements/latest ────────────────────────────────────────────
router.get('/latest', async (req, res) => {
  console.log(`[GET /api/settlements/latest] uid=${req.uid}`)
  try {
    const settlement = await getLatestSettlement()
    res.json({ settlement })
  } catch (err) {
    console.error(`[GET /api/settlements/latest] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/settlements ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  console.log(`[GET /api/settlements] uid=${req.uid}`)
  try {
    const settlements = await getRecentSettlements(10)
    res.json({ settlements })
  } catch (err) {
    console.error(`[GET /api/settlements] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/settlements/members/:memberId/balance ──────────────────────
/**
 * Admin override: set a member's running balance directly.
 * Body: { balance: number }
 * Response 200: { updated: true, members: MemberDocument[] }
 */
router.patch('/members/:memberId/balance', async (req, res) => {
  const { memberId } = req.params
  const { balance }  = req.body ?? {}

  console.log(`[PATCH /api/settlements/members/${memberId}/balance] uid=${req.uid}  balance=${balance}`)

  if (typeof balance !== 'number') {
    return res.status(400).json({ error: 'balance must be a number' })
  }

  try {
    await setMemberBalance(memberId, balance)
    const members = await getActiveMembers()
    res.json({ updated: true, members })
  } catch (err) {
    console.error(`[PATCH /api/settlements/members/${memberId}/balance] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/settlements/seed-members ─────────────────────────────────────
/**
 * Idempotent — safe to call multiple times.
 * Creates default members if none exist; returns current member list.
 */
router.post('/seed-members', async (req, res) => {
  console.log(`[POST /api/settlements/seed-members] uid=${req.uid}`)
  try {
    await ensureGroupMembers()
    const members = await getActiveMembers()
    res.json({ seeded: true, count: members.length, members })
  } catch (err) {
    console.error(`[POST /api/settlements/seed-members] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

export default router
