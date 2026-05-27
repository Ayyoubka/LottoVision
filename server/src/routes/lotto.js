import { Router }           from 'express'
import { fetchLatestDraw }  from '../services/paisScraper.js'
import { isFirestoreReady } from '../config/firestore.js'
import {
  saveDraw,
  getDraw,
  getRecentDraws,
  getDrawsForStats,
}                           from '../services/drawRepository.js'
import { computeStats, simulateTicket }   from '../services/analyticsEngine.js'
import { generateRecommendations }         from '../services/recommendationEngine.js'

const router = Router()

// ── Shared cache helpers ───────────────────────────────────────────────────

function makeCache(ttlMs) {
  const store = {}
  return {
    get: (key) => (store[key]?.expiresAt > Date.now() ? store[key].data : null),
    set: (key, data) => { store[key] = { data, expiresAt: Date.now() + ttlMs } },
  }
}

const drawCache  = makeCache(10 * 60 * 1000)   // 10 min — pais.co.il scrape
const statsCache = makeCache( 5 * 60 * 1000)   //  5 min — analytics computation
const simCache   = makeCache( 5 * 60 * 1000)   //  5 min — ticket simulation

// Allowed values for ?limit on /api/stats
const STATS_LIMITS  = new Set([12, 24, 50, 100])
const DEFAULT_LIMIT = 50

// ── GET /api/latest-draw ───────────────────────────────────────────────────
/**
 * Scrape the latest draw from pais.co.il, persist to Firestore, return it.
 *
 * Response 200: { drawId, date, numbers, strongNumber, cached? }
 * Response 503: { error: 'SCRAPE_FAILED', message }
 */
router.get('/latest-draw', async (req, res) => {
  const cached = drawCache.get('latest')
  if (cached) return res.json({ ...cached, cached: true })

  try {
    const draw = await fetchLatestDraw()
    drawCache.set('latest', draw)

    saveDraw(draw)
      .then(r => {
        if (r.saved)                       console.log(`Saved draw ${draw.drawId} to Firestore`)
        else if (r.reason === 'duplicate') console.log(`Draw ${draw.drawId} already in Firestore`)
      })
      .catch(err => console.error(`Firestore save error: ${err.message}`))

    res.json(draw)
  } catch (err) {
    console.error('[/api/latest-draw]', err.message)
    res.status(503).json({ error: 'SCRAPE_FAILED', message: err.message })
  }
})

// ── GET /api/draws ─────────────────────────────────────────────────────────
/**
 * Return stored draws from Firestore, newest first.
 * Query: ?limit=N  (1–100, default 10)
 *
 * Response 200: { draws: DrawRecord[], firestoreReady: boolean }
 */
router.get('/draws', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100)
  try {
    const draws = await getRecentDraws(limit)
    res.json({ draws, firestoreReady: isFirestoreReady() })
  } catch (err) {
    console.error('[/api/draws]', err.message)
    res.status(503).json({ error: err.message })
  }
})

// ── GET /api/draws/:drawId ─────────────────────────────────────────────────
/**
 * Return a single draw from Firestore.
 * Response 200: DrawRecord  |  404: { error: 'NOT_FOUND' }
 */
router.get('/draws/:drawId', async (req, res) => {
  const drawId = parseInt(req.params.drawId, 10)
  if (isNaN(drawId)) return res.status(400).json({ error: 'Invalid drawId' })

  try {
    const draw = await getDraw(drawId)
    if (!draw) return res.status(404).json({ error: 'NOT_FOUND' })
    res.json(draw)
  } catch (err) {
    console.error('[/api/draws/:drawId]', err.message)
    res.status(503).json({ error: err.message })
  }
})

// ── GET /api/stats ─────────────────────────────────────────────────────────
/**
 * Full analytics over the N most recent draws stored in Firestore.
 *
 * Query params:
 *   limit   12 | 24 | 50 | 100   (default 50)
 *
 * Response 200:
 * {
 *   range:           number,              // draws analysed
 *   totalDraws:      number,
 *   drawRange: {
 *     from: { drawId, date },
 *     to:   { drawId, date },
 *   },
 *   hotNumbers:  [ { number, count, pct } × 10 ],   // most frequent
 *   coldNumbers: [ { number, count, pct } × 10 ],   // least frequent
 *   frequency:   [ { number, count, pct } × 37 ],   // all numbers, sorted 1→37
 *   strongFrequency: [ { number, count, pct } × 7 ],
 *   commonPairs:   [ { pair: [n,n], count, pct } × 10 ],
 *   commonTriples: [ { triple: [n,n,n], count, pct } × 10 ],
 * }
 *
 * Response 400: { error: 'INVALID_LIMIT', validLimits: [12,24,50,100] }
 * Response 503: { error: 'FIRESTORE_UNAVAILABLE' }
 * Response 503: { error: 'NOT_ENOUGH_DATA', totalDraws, requested }
 */
router.get('/stats', async (req, res) => {
  // ── Validate ?limit ──────────────────────────────────────────────────
  const rawLimit = req.query.limit
  const limit    = rawLimit ? parseInt(rawLimit, 10) : DEFAULT_LIMIT

  if (!STATS_LIMITS.has(limit)) {
    return res.status(400).json({
      error:       'INVALID_LIMIT',
      validLimits: [...STATS_LIMITS],
    })
  }

  // ── Cache hit ────────────────────────────────────────────────────────
  const cacheKey = String(limit)
  const cached   = statsCache.get(cacheKey)
  if (cached) return res.json({ ...cached, cached: true })

  // ── Firestore guard ──────────────────────────────────────────────────
  if (!isFirestoreReady()) {
    return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
  }

  try {
    const draws = await getDrawsForStats(limit)

    if (draws.length === 0) {
      return res.status(503).json({
        error:      'NOT_ENOUGH_DATA',
        totalDraws: 0,
        requested:  limit,
      })
    }

    const stats = computeStats(draws)
    statsCache.set(cacheKey, stats)

    res.json(stats)
  } catch (err) {
    console.error('[/api/stats]', err.message)
    res.status(503).json({ error: err.message })
  }
})

// ── GET /api/recommendations ───────────────────────────────────────────────
/**
 * Generate 12 statistical ticket recommendations (3 per strategy).
 *
 * Strategies: smart | hot | balanced | risky
 *
 * Response 200:
 * {
 *   smart:    [3 × Ticket],
 *   hot:      [3 × Ticket],
 *   balanced: [3 × Ticket],
 *   risky:    [3 × Ticket],
 * }
 * Ticket: { numbers, strongNumber, strategy, label, explanation }
 *
 * Response 503: { error: 'FIRESTORE_UNAVAILABLE' | 'NOT_ENOUGH_DATA' }
 */
router.get('/recommendations', async (req, res) => {
  const cached = statsCache.get('recommendations')
  if (cached) return res.json({ ...cached, cached: true })

  if (!isFirestoreReady()) {
    return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
  }

  try {
    const draws = await getDrawsForStats(100)

    if (draws.length < 10) {
      return res.status(503).json({
        error:      'NOT_ENOUGH_DATA',
        totalDraws: draws.length,
        minimum:    10,
      })
    }

    const stats = computeStats(draws)
    const recs  = generateRecommendations(stats)

    statsCache.set('recommendations', recs)
    res.json(recs)
  } catch (err) {
    console.error('[/api/recommendations]', err.message)
    res.status(503).json({ error: err.message })
  }
})

// ── GET /api/simulate-ticket ───────────────────────────────────────────────
/**
 * Compare a ticket against the latest 100 stored draws.
 *
 * Query params:
 *   numbers  comma-separated 6 integers 1-37  e.g. "3,14,21,22,29,35"
 *   strong   single integer 1-7
 *
 * Response 200:
 * {
 *   ticket:  { numbers: number[], strong: number },
 *   summary: { totalDraws, totalCost, totalWinnings, profitLoss, roi, wins, bestDraw },
 *   draws:   [{ drawId, date, drawNumbers, drawStrong, matchedNumbers,
 *               matchedStrong, matchCount, tier, prizeLabel, prizeAmount }]
 * }
 *
 * Response 400: { error: 'INVALID_NUMBERS' | 'DUPLICATE_NUMBERS' | 'INVALID_STRONG' }
 * Response 503: { error: 'FIRESTORE_UNAVAILABLE' | 'NOT_ENOUGH_DATA' }
 */
router.get('/simulate-ticket', async (req, res) => {
  // ── Parse inputs ────────────────────────────────────────────────────
  const rawNums   = String(req.query.numbers ?? '')
  const rawStrong = String(req.query.strong  ?? '')

  const numbers = rawNums.split(',').map(s => parseInt(s.trim(), 10))
  const strong  = parseInt(rawStrong, 10)

  // ── Validate ────────────────────────────────────────────────────────
  if (
    numbers.length !== 6 ||
    numbers.some(n => isNaN(n) || n < 1 || n > 37)
  ) {
    return res.status(400).json({
      error:   'INVALID_NUMBERS',
      message: '6 numbers required, each between 1 and 37',
    })
  }

  if (new Set(numbers).size !== 6) {
    return res.status(400).json({
      error:   'DUPLICATE_NUMBERS',
      message: 'All 6 numbers must be unique',
    })
  }

  if (isNaN(strong) || strong < 1 || strong > 7) {
    return res.status(400).json({
      error:   'INVALID_STRONG',
      message: 'Strong number must be between 1 and 7',
    })
  }

  // ── Firestore guard ──────────────────────────────────────────────────
  if (!isFirestoreReady()) {
    return res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' })
  }

  // ── Cache ────────────────────────────────────────────────────────────
  const sortedNums = [...numbers].sort((a, b) => a - b)
  const cacheKey   = `${sortedNums.join(',')}-${strong}`
  const cached     = simCache.get(cacheKey)
  if (cached) return res.json({ ...cached, cached: true })

  // ── Compute ──────────────────────────────────────────────────────────
  try {
    const draws = await getDrawsForStats(100)

    if (draws.length === 0) {
      return res.status(503).json({
        error:      'NOT_ENOUGH_DATA',
        totalDraws: 0,
      })
    }

    const result = simulateTicket(numbers, strong, draws)
    simCache.set(cacheKey, result)
    res.json(result)
  } catch (err) {
    console.error('[/api/simulate-ticket]', err.message)
    res.status(503).json({ error: err.message })
  }
})

export default router
