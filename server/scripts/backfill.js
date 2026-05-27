/**
 * Backfill script — fetches the latest 100 Lotto draws and saves them to Firestore.
 *
 * Usage:
 *   cd server
 *   node scripts/backfill.js [--limit 100] [--delay 600]
 *
 * Options:
 *   --limit N    How many draws to backfill (default: 100)
 *   --delay N    Milliseconds between HTTP requests (default: 600)
 */

import 'dotenv/config'
import { resolveLatestDrawId, fetchDrawById } from '../src/services/paisScraper.js'
import { isFirestoreReady }                   from '../src/config/firestore.js'
import { getDraw, saveDraw }                  from '../src/services/drawRepository.js'

// ── CLI args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args  = process.argv.slice(2)
  let limit   = 100
  let delay   = 600

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10)
    if (args[i] === '--delay' && args[i + 1]) delay = parseInt(args[++i], 10)
  }

  return { limit: Math.max(1, limit), delay: Math.max(0, delay) }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pad(n, width) { return String(n).padStart(width, ' ') }

function fmt(draw) {
  const nums = draw.numbers.join(',')
  return `[${nums}] + ${draw.strongNumber}`
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { limit, delay } = parseArgs()

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' Israeli Lotto — Firestore Backfill')
  console.log(`  target : last ${limit} draws`)
  console.log(`  delay  : ${delay} ms between requests`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Firestore must be ready before we can save anything
  if (!isFirestoreReady()) {
    console.error('\n[ERROR] Firestore is not configured.')
    console.error('  Set GOOGLE_APPLICATION_CREDENTIALS in server/.env and try again.\n')
    process.exit(1)
  }

  // Resolve the latest published draw
  console.log('\nResolving latest draw ID from pais.co.il …')
  let latestId
  try {
    latestId = await resolveLatestDrawId()
  } catch (err) {
    console.error(`[ERROR] Could not resolve latest draw ID: ${err.message}`)
    process.exit(1)
  }
  console.log(`Latest draw: #${latestId}\n`)

  // ── Walk backwards ────────────────────────────────────────────────────
  const startTime    = Date.now()
  let saved          = 0
  let skipped        = 0
  let failed         = 0
  let consecutiveFails = 0
  const FAIL_LIMIT   = 5          // stop after 5 consecutive errors
  const LABEL_WIDTH  = String(limit).length

  let firstDrawId = null
  let lastDrawId  = null

  for (let i = 0; i < limit; i++) {
    const drawId = latestId - i
    if (drawId < 1) break

    const seq = pad(i + 1, LABEL_WIDTH)

    // ── Check Firestore first (skip if already stored) ─────────────────
    let existing = null
    try {
      existing = await getDraw(drawId)
    } catch {
      // Non-fatal — treat as "not found"
    }

    if (existing) {
      console.log(`[${seq}/${limit}] #${drawId}  — already stored, skipping`)
      skipped++
      consecutiveFails = 0
      lastDrawId ??= drawId
      firstDrawId = drawId
      continue
    }

    // ── Fetch from pais.co.il ──────────────────────────────────────────
    let draw
    try {
      draw = await fetchDrawById(drawId)
    } catch (err) {
      console.log(`[${seq}/${limit}] #${drawId}  ✗ fetch failed — ${err.message}`)
      failed++
      consecutiveFails++

      if (consecutiveFails >= FAIL_LIMIT) {
        console.log(`\n[STOP] ${FAIL_LIMIT} consecutive failures — likely reached the end of published draws.`)
        break
      }

      // Polite delay even on error
      if (i < limit - 1) await sleep(delay)
      continue
    }

    // ── Save to Firestore ──────────────────────────────────────────────
    try {
      const result = await saveDraw(draw)

      if (result.saved) {
        console.log(`[${seq}/${limit}] #${drawId}  ✓ saved   ${draw.date}   ${fmt(draw)}`)
        saved++
        consecutiveFails = 0
        lastDrawId ??= drawId
        firstDrawId = drawId
      } else {
        // Duplicate — race condition between getDraw check and saveDraw
        console.log(`[${seq}/${limit}] #${drawId}  — duplicate (race), skipped`)
        skipped++
        consecutiveFails = 0
        lastDrawId ??= drawId
        firstDrawId = drawId
      }
    } catch (err) {
      console.log(`[${seq}/${limit}] #${drawId}  ✗ save failed — ${err.message}`)
      failed++
      consecutiveFails++

      if (consecutiveFails >= FAIL_LIMIT) {
        console.log(`\n[STOP] ${FAIL_LIMIT} consecutive failures.`)
        break
      }
    }

    // ── Polite delay ───────────────────────────────────────────────────
    if (i < limit - 1) await sleep(delay)
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' Backfill complete')
  console.log(`  saved   : ${saved}`)
  console.log(`  skipped : ${skipped}  (already in Firestore)`)
  console.log(`  failed  : ${failed}`)
  if (firstDrawId && lastDrawId) {
    console.log(`  range   : #${firstDrawId} → #${lastDrawId}`)
  }
  console.log(`  elapsed : ${elapsed}s`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  process.exit(failed > 0 ? 1 : 0)
}

main()
