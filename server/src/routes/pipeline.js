/**
 * Pipeline routes — authenticated users only (admin-only app).
 *
 * POST /api/pipeline/run-latest   — execute the full weekly pipeline
 * GET  /api/pipeline/status       — last pipeline run result
 */

import { Router }               from 'express'
import { verifyToken }          from '../middleware/verifyToken.js'
import { runLatestPipeline }    from '../services/drawPipelineService.js'
import { getLastPipelineRun }   from '../repositories/pipelineRepository.js'

const router = Router()
router.use(verifyToken)

// ── POST /api/pipeline/run-latest ─────────────────────────────────────────
/**
 * Triggers the full weekly pipeline:
 *   1. Scrape & save latest draw
 *   2. Find / auto-link active group ticket
 *   3. Run prize engine on ticket
 *   4. Run group settlement
 *
 * Safe to call multiple times — fully idempotent.
 *
 * Response 200: PipelineResult
 * Response 500: { error }  (only on unhandled system errors)
 */
router.post('/run-latest', async (req, res) => {
  console.log(`[POST /api/pipeline/run-latest] uid=${req.uid}`)
  try {
    const result = await runLatestPipeline()

    // Pipeline errors are captured inside result.error, not thrown
    console.log(
      `[POST /api/pipeline/run-latest] done` +
      `  drawId=${result.drawId}  ticketChecked=${result.ticketChecked}` +
      `  winnings=₪${result.winnings}  memberDelta=₪${result.memberDelta}` +
      `  error=${result.error ?? 'none'}`
    )

    res.json(result)
  } catch (err) {
    console.error(`[POST /api/pipeline/run-latest] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/pipeline/status ──────────────────────────────────────────────
/**
 * Returns the result of the most recent pipeline execution.
 * Survives page refreshes — persisted in Firestore settings/lastPipeline.
 *
 * Response 200: { status: PipelineResult | null }
 */
router.get('/status', async (req, res) => {
  console.log(`[GET /api/pipeline/status] uid=${req.uid}`)
  try {
    const status = await getLastPipelineRun()
    res.json({ status })
  } catch (err) {
    console.error(`[GET /api/pipeline/status] ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

export default router
