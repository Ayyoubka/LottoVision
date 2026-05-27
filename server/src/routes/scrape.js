/**
 * Scrape routes — manual trigger for Firestore sync.
 *
 * Future: these endpoints double as webhook targets for a Cloud Scheduler
 * cron job. Add an Authorization header check before exposing publicly.
 * Suggested schedule: "0 22 * * 2,6" (22:00 on Tuesdays and Saturdays, IL time)
 */

import { Router }          from 'express'
import { syncLatestDraw }  from '../services/lottoScraper.js'

const router = Router()

// ── GET /api/scrape/latest ─────────────────────────────────────────────────
/**
 * Fetch the latest Lotto draw from pais.co.il and persist it to Firestore.
 * Safe to call multiple times — duplicate draws are detected and skipped.
 *
 * Response 200:
 * {
 *   inserted:  boolean,   // true  → new draw saved to Firestore
 *   skipped:   boolean,   // true  → draw already existed, no write performed
 *   draw: {
 *     drawId:       number,
 *     date:         string,    // "DD/MM/YYYY"
 *     numbers:      number[],  // 6 sorted main numbers
 *     strongNumber: number,    // 1–7   (field name matches existing schema)
 *     fetchedAt:    Timestamp, // present when skipped (stored value)
 *     year:         number,
 *     month:        number,
 *     dayOfWeek:    number,
 *   },
 *   scrapeMs:  number,    // time spent fetching from pais.co.il
 *   totalMs:   number,    // total operation time
 * }
 *
 * Response 503: { error: 'SCRAPE_FAILED' | 'FIRESTORE_UNAVAILABLE', message }
 */
router.get('/latest', async (req, res) => {
  console.log('[GET /api/scrape/latest] Sync triggered')

  try {
    const result = await syncLatestDraw()

    console.log(
      `[GET /api/scrape/latest] Done — ` +
      `${result.inserted ? 'INSERTED' : 'SKIPPED'} draw #${result.draw.drawId}` +
      `  totalMs=${result.totalMs}`
    )

    res.json(result)
  } catch (err) {
    console.error('[GET /api/scrape/latest] Error:', err.message)

    // Map known error codes to meaningful HTTP responses
    const errorMap = {
      NETWORK_ERROR:           { status: 503, error: 'SCRAPE_NETWORK_ERROR'    },
      PARSE_ERROR:             { status: 502, error: 'SCRAPE_PARSE_ERROR'      },
      SCRAPE_VALIDATION_FAILED:{ status: 502, error: 'SCRAPE_VALIDATION_FAILED'},
    }

    const mapped = errorMap[err.code]
    const status = mapped?.status ?? (err.message.includes('not configured') ? 503 : 500)
    const code   = mapped?.error  ?? (err.message.includes('not configured') ? 'FIRESTORE_UNAVAILABLE' : 'SCRAPE_FAILED')

    res.status(status).json({ error: code, message: err.message })
  }
})

export default router
