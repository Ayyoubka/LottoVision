/**
 * Admin draw import route — authenticated users only (Firebase ID token).
 *
 * POST /api/admin/import-draw
 *   Accepts a draw result + prize table entered manually by the admin,
 *   persists both to Firestore, then runs the full settlement pipeline.
 *
 * The pipeline (runPipelineForDraw) reads everything from Firestore —
 * no request to pais.co.il is ever made from this path.
 */

import { Router }             from 'express'
import { verifyToken }        from '../middleware/verifyToken.js'
import { requireAdmin }       from '../middleware/requireAdmin.js'
import { saveDraw }           from '../services/drawRepository.js'
import { savePrizeTable, REQUIRED_KEYS } from '../repositories/prizeTableRepository.js'
import { runPipelineForDraw } from '../services/drawPipelineService.js'

const router = Router()
router.use(verifyToken)
router.use(requireAdmin)

// ── POST /api/admin/import-draw ───────────────────────────────────────────
router.post('/import-draw', async (req, res) => {
  const { drawId, date, numbers, strongNumber, prizes } = req.body ?? {}

  console.log(`[POST /api/admin/import-draw] uid=${req.uid}  drawId=${drawId}  date=${date}`)

  // ── Validate draw shape ──────────────────────────────────────────────────
  const errors = []

  if (!Number.isInteger(drawId) || drawId < 1)
    errors.push(`invalid drawId: ${drawId}`)

  if (!date || !/^\d{2}\/\d{2}\/\d{4}$/.test(date))
    errors.push(`invalid date: "${date}" — expected DD/MM/YYYY`)

  if (!Array.isArray(numbers) || numbers.length !== 6)
    errors.push(`expected 6 numbers, got ${numbers?.length ?? 'none'}`)
  else if (numbers.some(n => !Number.isInteger(n) || n < 1 || n > 37))
    errors.push(`numbers out of range 1–37: [${numbers}]`)
  else if (new Set(numbers).size !== 6)
    errors.push(`duplicate numbers: [${numbers}]`)

  if (!Number.isInteger(strongNumber) || strongNumber < 1 || strongNumber > 7)
    errors.push(`invalid strongNumber: ${strongNumber} — expected 1–7`)

  // ── Validate prize table ─────────────────────────────────────────────────
  if (!prizes || typeof prizes !== 'object') {
    errors.push('prizes object is required')
  } else {
    for (const key of REQUIRED_KEYS) {
      const val = prizes[key]
      if (!Number.isInteger(val) || val < 0)
        errors.push(`prizes['${key}'] must be a non-negative integer, got ${val}`)
    }
  }

  if (errors.length) {
    console.warn(`[POST /api/admin/import-draw] validation failed: ${errors.join('; ')}`)
    return res.status(400).json({ error: 'VALIDATION_FAILED', details: errors })
  }

  try {
    // ── Persist draw (idempotent) ────────────────────────────────────────
    const draw       = { drawId, date, numbers, strongNumber }
    const saveResult = await saveDraw(draw)
    console.log(
      `[POST /api/admin/import-draw] saveDraw → saved=${saveResult.saved}` +
      `  reason=${saveResult.reason ?? 'none'}`
    )

    // ── Persist prize table (upsert — admin may correct typos) ───────────
    await savePrizeTable(drawId, prizes)
    console.log(`[POST /api/admin/import-draw] prize table saved for draw #${drawId}`)

    // ── Run settlement pipeline (Firestore-only, no pais.co.il request) ──
    const pipelineResult = await runPipelineForDraw(drawId, 'admin-import')
    console.log(
      `[POST /api/admin/import-draw] pipeline done` +
      `  ticketChecked=${pipelineResult.ticketChecked}` +
      `  winnings=₪${pipelineResult.winnings}` +
      `  error=${pipelineResult.error ?? 'none'}`
    )

    res.json({
      inserted:       saveResult.saved,
      skipped:        !saveResult.saved,
      drawId,
      pipelineResult,
    })
  } catch (err) {
    console.error(`[POST /api/admin/import-draw] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

export default router
