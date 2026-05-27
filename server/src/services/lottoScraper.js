/**
 * lottoScraper.js — orchestration layer for scraping + persisting Lotto draws.
 *
 * This module sits between the raw HTTP scraper (paisScraper.js) and the
 * Firestore data-access layer (drawRepository.js). It owns the "fetch and
 * save" workflow and returns a structured sync result so callers can tell
 * whether a draw was newly inserted or already existed.
 *
 * Future: wrap syncLatestDraw() in a scheduled Cloud Function or cron job
 * to keep Firestore automatically up to date after every draw (Tuesday &
 * Saturday nights, ~22:00 Israel time). The function signature is intentionally
 * side-effect-free — it only reads and writes Firestore, making it safe to
 * call on a schedule without additional guards.
 */

import { fetchLatestDraw } from './paisScraper.js'
import { saveDraw, getDraw } from './drawRepository.js'
import { isFirestoreReady } from '../config/firestore.js'

/**
 * Sync result shape:
 * {
 *   inserted:  boolean   — true if the draw was new and saved to Firestore
 *   skipped:   boolean   — true if the draw already existed (duplicate)
 *   draw:      object    — the draw data (from Firestore if skipped, scraped if inserted)
 *   scrapeMs:  number    — time spent fetching from pais.co.il
 *   totalMs:   number    — total wall-clock time for the operation
 * }
 */

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a scraped draw object before writing to Firestore.
 * Throws a descriptive ScrapeValidationError if the data looks wrong.
 */
function validateDraw(draw) {
  const errors = []

  if (!draw || typeof draw !== 'object')
    errors.push('draw result is null or non-object')

  if (!Number.isInteger(draw?.drawId) || draw.drawId < 1)
    errors.push(`invalid drawId: ${draw?.drawId}`)

  if (!draw?.date || !/^\d{2}\/\d{2}\/\d{4}$/.test(draw.date))
    errors.push(`invalid date format: "${draw?.date}" (expected DD/MM/YYYY)`)

  if (!Array.isArray(draw?.numbers) || draw.numbers.length !== 6)
    errors.push(`expected 6 main numbers, got ${draw?.numbers?.length ?? 'none'}`)
  else if (draw.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 37))
    errors.push(`main numbers out of range (1–37): [${draw.numbers.join(',')}]`)
  else if (new Set(draw.numbers).size !== 6)
    errors.push(`duplicate main numbers detected: [${draw.numbers.join(',')}]`)

  if (!Number.isInteger(draw?.strongNumber) || draw.strongNumber < 1 || draw.strongNumber > 7)
    errors.push(`invalid strongNumber: ${draw?.strongNumber} (expected 1–7)`)

  if (errors.length) {
    const err = new Error(`Scrape validation failed:\n  • ${errors.join('\n  • ')}`)
    err.code  = 'SCRAPE_VALIDATION_FAILED'
    throw err
  }
}

/**
 * Fetch the latest Lotto draw from pais.co.il and persist it to Firestore.
 * Idempotent: calling it multiple times for the same draw is safe.
 *
 * @returns {Promise<{ inserted: boolean, skipped: boolean, draw: object, scrapeMs: number, totalMs: number }>}
 * @throws  ScrapeNetworkError    — pais.co.il unreachable or HTTP error
 * @throws  ScrapeValidationError — scraper returned garbage / incomplete data
 * @throws  Error                 — Firestore not configured
 */
export async function syncLatestDraw() {
  const t0 = Date.now()

  if (!isFirestoreReady()) {
    throw new Error('Firestore is not configured — set GOOGLE_APPLICATION_CREDENTIALS in server/.env')
  }

  // ── 1. Scrape pais.co.il ──────────────────────────────────────────────────
  console.log('[LottoScraper] Fetching latest draw from pais.co.il …')
  const t1 = Date.now()
  let draw

  try {
    draw = await fetchLatestDraw()
  } catch (err) {
    const isNetwork = (
      err.code === 'ECONNREFUSED'   ||
      err.code === 'ENOTFOUND'      ||
      err.code === 'ETIMEDOUT'      ||
      err.code === 'ECONNRESET'     ||
      err.message?.includes('timeout') ||
      err.message?.includes('network')
    )
    const tag = isNetwork ? 'NETWORK_ERROR' : 'PARSE_ERROR'
    console.error(`[LottoScraper] Scrape failed (${tag}): ${err.message}`)
    const wrapped     = new Error(`${tag}: ${err.message}`)
    wrapped.code      = tag
    wrapped.scrapeMs  = Date.now() - t1
    throw wrapped
  }

  const scrapeMs = Date.now() - t1

  console.log(
    `[LottoScraper] Raw scraped result:` +
    `  drawId=${draw.drawId}  date="${draw.date}"` +
    `  numbers=[${draw.numbers?.join(',')}]  strongNumber=${draw.strongNumber}` +
    `  (${scrapeMs}ms)`
  )

  // ── 2. Validate parsed data ───────────────────────────────────────────────
  try {
    validateDraw(draw)
    console.log(`[LottoScraper] Validation passed for draw #${draw.drawId}`)
  } catch (err) {
    console.error(`[LottoScraper] ${err.message}`)
    throw err
  }

  // ── 2. Check for duplicate before writing ─────────────────────────────────
  // saveDraw() already does an internal exists-check, but we do an explicit
  // pre-read so we can return the stored document on a skip (avoids a second
  // round-trip inside saveDraw when we need the full record anyway).
  const existing = await getDraw(draw.drawId)

  if (existing) {
    console.log(`[LottoScraper] Draw #${draw.drawId} already in Firestore — skipping insert`)
    return {
      inserted:  false,
      skipped:   true,
      draw:      existing,
      scrapeMs,
      totalMs:   Date.now() - t0,
    }
  }

  // ── 3. Save to Firestore ──────────────────────────────────────────────────
  // Note: the draw document uses `strongNumber` (not `strong`) and `fetchedAt`
  // (not `createdAt`) to stay consistent with the existing collection schema
  // that analytics, simulation, and backfill all depend on.
  // `jackpot` is not scraped from pais.co.il yet — reserved for future expansion.
  const saveResult = await saveDraw(draw)

  if (saveResult.saved) {
    console.log(`[LottoScraper] Draw #${draw.drawId} saved to Firestore ✓`)
    return {
      inserted:  true,
      skipped:   false,
      draw,
      scrapeMs,
      totalMs:   Date.now() - t0,
    }
  }

  // saveDraw returned saved:false despite no existing doc — race condition
  // (two concurrent requests both passed the getDraw check). Fetch the stored
  // version so the caller still gets a consistent draw object.
  console.log(`[LottoScraper] Draw #${draw.drawId} race-condition duplicate — fetching stored record`)
  const storedAfterRace = await getDraw(draw.drawId)
  return {
    inserted:  false,
    skipped:   true,
    draw:      storedAfterRace ?? draw,
    scrapeMs,
    totalMs:   Date.now() - t0,
  }
}
