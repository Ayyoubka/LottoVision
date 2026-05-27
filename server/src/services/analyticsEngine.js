/**
 * Analytics engine — pure computation, no I/O.
 *
 * Takes an array of draw documents and returns a fully-computed stats object
 * ready to be serialised straight to a dashboard API response.
 *
 * Terminology
 *  hot    – appears most often in the sample window
 *  cold   – appears least often (includes count=0)
 *  pair   – any 2-number combination that appeared together in one draw
 *  triple – any 3-number combination that appeared together in one draw
 */

// ── Combinatorics helper ───────────────────────────────────────────────────

/**
 * Yield every k-element combination from arr (no repetition, order-insensitive).
 * Uses an iterative stack to avoid call-stack limits on large arrays.
 * @param {number[]} arr  already sorted
 * @param {number}   k
 * @returns {number[][]}
 */
function combinations(arr, k) {
  const result = []
  const stack  = [{ start: 0, combo: [] }]

  while (stack.length) {
    const { start, combo } = stack.pop()
    if (combo.length === k) { result.push(combo); continue }

    const need = k - combo.length
    for (let i = arr.length - 1; i >= start; i--) {
      if (arr.length - i >= need) {           // pruning: enough elements left
        stack.push({ start: i + 1, combo: [...combo, arr[i]] })
      }
    }
  }

  return result
}

// ── Core engine ────────────────────────────────────────────────────────────

/**
 * Compute full analytics from an array of draw documents.
 *
 * @param {Array<{
 *   drawId:       number,
 *   date:         string,
 *   numbers:      number[],
 *   strongNumber: number,
 * }>} draws
 *
 * @returns {{
 *   range:           number,
 *   totalDraws:      number,
 *   drawRange:       { from: object, to: object },
 *   hotNumbers:      { number: number, count: number, pct: number }[],
 *   coldNumbers:     { number: number, count: number, pct: number }[],
 *   frequency:       { number: number, count: number, pct: number }[],
 *   strongFrequency: { number: number, count: number, pct: number }[],
 *   commonPairs:     { pair: number[], count: number, pct: number }[],
 *   commonTriples:   { triple: number[], count: number, pct: number }[],
 * }}
 */
export function computeStats(draws) {
  const total = draws.length

  // Sort by drawId so drawRange.from / .to are correct regardless of fetch order
  const sorted = [...draws].sort((a, b) => a.drawId - b.drawId)

  // ── Number frequency (main 1-37) ───────────────────────────────────────
  const numCount = {}
  for (const draw of draws) {
    for (const n of draw.numbers ?? []) {
      numCount[n] = (numCount[n] ?? 0) + 1
    }
  }

  const frequency = []
  for (let n = 1; n <= 37; n++) {
    const count = numCount[n] ?? 0
    frequency.push({
      number: n,
      count,
      pct: pct(count, total),
    })
  }

  // Sorted copies for hot / cold
  const byCountDesc = [...frequency].sort((a, b) => b.count - a.count || a.number - b.number)
  const byCountAsc  = [...frequency].sort((a, b) => a.count - b.count || a.number - b.number)

  const hotNumbers  = byCountDesc.slice(0, 10)
  const coldNumbers = byCountAsc.slice(0, 10)

  // ── Strong number frequency (1-7) ──────────────────────────────────────
  const strongCount = {}
  for (const draw of draws) {
    const s = draw.strongNumber
    if (s != null) strongCount[s] = (strongCount[s] ?? 0) + 1
  }

  const strongFrequency = []
  for (let s = 1; s <= 7; s++) {
    const count = strongCount[s] ?? 0
    strongFrequency.push({
      number: s,
      count,
      pct: pct(count, total),
    })
  }

  // ── Pairs ──────────────────────────────────────────────────────────────
  const pairCount = {}
  for (const draw of draws) {
    const nums = sorted_nums(draw.numbers)
    for (const pair of combinations(nums, 2)) {
      const key = pair.join('-')
      pairCount[key] = (pairCount[key] ?? 0) + 1
    }
  }

  const commonPairs = Object.entries(pairCount)
    .map(([key, count]) => ({
      pair:  key.split('-').map(Number),
      count,
      pct:   pct(count, total),
    }))
    .sort((a, b) => b.count - a.count || a.pair[0] - b.pair[0] || a.pair[1] - b.pair[1])
    .slice(0, 10)

  // ── Triples ────────────────────────────────────────────────────────────
  const tripleCount = {}
  for (const draw of draws) {
    const nums = sorted_nums(draw.numbers)
    for (const triple of combinations(nums, 3)) {
      const key = triple.join('-')
      tripleCount[key] = (tripleCount[key] ?? 0) + 1
    }
  }

  const commonTriples = Object.entries(tripleCount)
    .map(([key, count]) => ({
      triple: key.split('-').map(Number),
      count,
      pct:    pct(count, total),
    }))
    .sort((a, b) => b.count - a.count || a.triple[0] - b.triple[0])
    .slice(0, 10)

  // ── Result ─────────────────────────────────────────────────────────────
  return {
    range:      total,
    totalDraws: total,
    drawRange: {
      from: { drawId: sorted[0].drawId,              date: sorted[0].date              },
      to:   { drawId: sorted[sorted.length - 1].drawId, date: sorted[sorted.length - 1].date },
    },
    hotNumbers,
    coldNumbers,
    frequency,
    strongFrequency,
    commonPairs,
    commonTriples,
  }
}

// ── Tiny helpers ───────────────────────────────────────────────────────────

/** Round to one decimal, return as number (not string). */
const pct = (count, total) =>
  total === 0 ? 0 : parseFloat(((count / total) * 100).toFixed(1))

/** Sort a numbers array ascending; tolerates null/undefined. */
const sorted_nums = (nums) =>
  (nums ?? []).slice().sort((a, b) => a - b)

// ── Ticket simulator ────────────────────────────────────────────────────────

const TICKET_PRICE = 6   // official Pais price per combination

/** Typical prize amounts (ILS) used for simulation estimates. */
const PRIZE_TABLE = {
  '6+s': { label: 'Class 1 · Jackpot', amount: 3_000_000 },
  '6':   { label: 'Class 2',           amount:   500_000 },
  '5+s': { label: 'Class 3',           amount:     5_300 },
  '5':   { label: 'Class 4',           amount:       600 },
  '4+s': { label: 'Class 5',           amount:       154 },
  '4':   { label: 'Class 6',           amount:        47 },
  '3+s': { label: 'Class 7',           amount:        39 },
  '3':   { label: 'Class 8',           amount:        10 },
}

/**
 * Compare a ticket against an array of historical draws.
 *
 * @param {number[]} ticketNumbers  6 main numbers (1-37), any order
 * @param {number}   ticketStrong   strong number (1-7)
 * @param {object[]} draws          array of draw documents from Firestore
 *
 * @returns {{
 *   ticket:  { numbers: number[], strong: number },
 *   summary: { totalDraws, totalCost, totalWinnings, profitLoss, roi, wins, bestDraw },
 *   draws:   DrawResult[]     newest first
 * }}
 */
export function simulateTicket(ticketNumbers, ticketStrong, draws) {
  const ticketSet = new Set(ticketNumbers)

  const drawResults  = []
  let   totalWinnings = 0
  let   bestDraw      = null

  for (const draw of draws) {
    const matchedNumbers = (draw.numbers ?? []).filter(n => ticketSet.has(n))
    const matchedStrong  = draw.strongNumber === ticketStrong

    const key   = matchedStrong ? `${matchedNumbers.length}+s` : `${matchedNumbers.length}`
    const prize = PRIZE_TABLE[key] ?? null

    const prizeAmount = prize?.amount ?? 0
    totalWinnings += prizeAmount

    const drawResult = {
      drawId:         draw.drawId,
      date:           draw.date,
      drawNumbers:    draw.numbers,
      drawStrong:     draw.strongNumber,
      matchedNumbers,
      matchedStrong,
      matchCount:     matchedNumbers.length,
      tier:           prize ? key : null,
      prizeLabel:     prize?.label ?? null,
      prizeAmount,
    }

    drawResults.push(drawResult)

    if (prize && (!bestDraw || prizeAmount > bestDraw.prizeAmount)) {
      bestDraw = drawResult
    }
  }

  drawResults.sort((a, b) => b.drawId - a.drawId)   // newest first

  const totalDraws = draws.length
  const totalCost  = totalDraws * TICKET_PRICE
  const profitLoss = totalWinnings - totalCost
  const roi        = totalCost > 0
    ? parseFloat(((profitLoss / totalCost) * 100).toFixed(1))
    : 0

  return {
    ticket: {
      numbers: [...ticketNumbers].sort((a, b) => a - b),
      strong:  ticketStrong,
    },
    summary: {
      totalDraws,
      totalCost,
      totalWinnings,
      profitLoss,
      roi,
      wins:     drawResults.filter(r => r.tier !== null).length,
      bestDraw,
    },
    draws: drawResults,
  }
}
