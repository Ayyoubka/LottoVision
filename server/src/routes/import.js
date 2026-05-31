/**
 * Import routes — authenticated by API key for automated relay (GitHub Actions).
 *
 * POST /api/import/draw
 *   Accepts an externally-scraped draw, writes it to Firestore, then runs
 *   the full weekly pipeline without making any request to pais.co.il.
 */

import { Router }             from 'express'
import { verifyApiKey }       from '../middleware/verifyApiKey.js'
import { saveDraw }           from '../services/drawRepository.js'
import { runPipelineForDraw } from '../services/drawPipelineService.js'

const router = Router()
router.use(verifyApiKey)

// ── POST /api/import/draw ─────────────────────────────────────────────────
router.post('/draw', async (req, res) => {
  const { drawId, date, numbers, strongNumber } = req.body

  console.log(`[POST /api/import/draw] drawId=${drawId}  date=${date}`)

  // ── Validate shape ───────────────────────────────────────────────────────
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

  if (errors.length) {
    console.warn(`[POST /api/import/draw] validation failed: ${errors.join('; ')}`)
    return res.status(400).json({ error: 'VALIDATION_FAILED', details: errors })
  }

  try {
    // ── Write draw to Firestore (idempotent) ─────────────────────────────
    const draw       = { drawId, date, numbers, strongNumber }
    const saveResult = await saveDraw(draw)
    console.log(
      `[POST /api/import/draw] saveDraw → saved=${saveResult.saved}` +
      `  reason=${saveResult.reason ?? 'none'}`
    )

    // ── Run pipeline from Firestore — no pais.co.il request ─────────────
    const pipelineResult = await runPipelineForDraw(drawId, 'github-actions')
    console.log(
      `[POST /api/import/draw] pipeline done` +
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
    console.error(`[POST /api/import/draw] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

export default router
