/**
 * Recommendation Engine — pure statistics, no AI.
 *
 * Consumes the output of analyticsEngine.computeStats() and generates 12 tickets
 * across 4 strategies: smart, hot, balanced, risky.
 *
 * Each ticket: { numbers[6], strongNumber, strategy, label, explanation }
 */

// ── Utilities ──────────────────────────────────────────────────────────────

/** Sort a frequency array desc (or asc), return array of number values. */
function sortedNums(freqArr, asc = false) {
  return [...freqArr]
    .sort((a, b) =>
      asc
        ? a.count - b.count || a.number - b.number
        : b.count - a.count || a.number - b.number
    )
    .map(f => f.number)
}

/**
 * Pick up to `count` values from `pool` (ordered) not already in `exclude`.
 * Returns fewer than `count` only when pool is exhausted.
 */
function pickFrom(pool, count, exclude = new Set()) {
  const result = []
  for (const n of pool) {
    if (result.length >= count) break
    if (!exclude.has(n)) result.push(n)
  }
  return result
}

/** Safe pool accessor — clamps index to last element instead of returning undefined. */
const at = (arr, i) => arr[Math.min(i, arr.length - 1)]

/** Build a ticket object. Numbers are always sorted ascending. */
function ticket(numbers, strongNumber, strategy, label, explanation) {
  return {
    numbers:      [...new Set(numbers)].sort((a, b) => a - b).slice(0, 6),
    strongNumber,
    strategy,
    label,
    explanation,
  }
}

// ── Strategy: Smart ────────────────────────────────────────────────────────
// Seed each ticket from one of the top co-occurring pairs, then fill the
// remaining slots with the hottest numbers not yet included.

function smartTickets(hotNums, topPairs, hotStrong) {
  const descs = [
    'Top pair seed · extended with hottest numbers',
    '2nd common pair seed · hot fill',
    '3rd common pair seed · hot fill',
  ]

  const used = new Set()

  return [0, 1, 2].map(i => {
    const seed   = topPairs[i] ?? topPairs[0]
    const picked = new Set(seed)

    for (const n of hotNums) {
      if (picked.size >= 6) break
      picked.add(n)
    }

    // Ensure uniqueness across the 3 tickets by swapping the last number
    // when we produce a combo we've already seen.
    const key = [...picked].sort((a, b) => a - b).join(',')
    if (used.has(key)) {
      // Replace the tail number with the next available hot number
      const nums = [...picked].sort((a, b) => a - b)
      const tail  = nums[nums.length - 1]
      const spare = hotNums.find(n => !picked.has(n))
      if (spare) { picked.delete(tail); picked.add(spare) }
    }
    used.add([...picked].sort((a, b) => a - b).join(','))

    return ticket(
      [...picked],
      hotStrong[i % hotStrong.length],
      'smart',
      'Smart Pick',
      descs[i],
    )
  })
}

// ── Strategy: Hot ──────────────────────────────────────────────────────────
// Three slightly different draws from the top 12 most frequent numbers.

function hotTickets(hotNums, hotStrong) {
  const pool = hotNums.slice(0, 12)

  const selections = [
    [at(pool,0), at(pool,1), at(pool,2), at(pool,3), at(pool,4), at(pool,5)],
    [at(pool,0), at(pool,1), at(pool,2), at(pool,3), at(pool,4), at(pool,6)],
    [at(pool,0), at(pool,1), at(pool,2), at(pool,3), at(pool,5), at(pool,7)],
  ]

  const descs = [
    'Six most frequently drawn numbers',
    'Hot core · 7th most frequent replaces 6th',
    'Hot core · two alternates in the mix',
  ]

  return selections.map((nums, i) =>
    ticket(nums, hotStrong[i % hotStrong.length], 'hot', 'Hot Numbers', descs[i])
  )
}

// ── Strategy: Balanced ─────────────────────────────────────────────────────
// Three tickets enforcing different balance rules:
//   1. 3 hot + 3 cold by raw rank
//   2. 3 odd + 3 even, frequency-weighted
//   3. 3 low (1–18) + 3 high (19–37), frequency-weighted

function balancedTickets(hotNums, coldNums, hotStrong) {
  const midStrong = hotStrong[Math.floor(hotStrong.length / 2)]
  const results   = []

  // ── T1: 3 hottest + 3 coldest ─────────────────────────────────────────
  {
    const hot  = pickFrom(hotNums, 3, new Set())
    const cold = pickFrom(coldNums, 3, new Set(hot))
    results.push(ticket(
      [...hot, ...cold],
      midStrong,
      'balanced',
      'Balanced',
      '3 most-frequent + 3 least-frequent numbers',
    ))
  }

  // ── T2: strict 3 odd + 3 even, preferring hot ─────────────────────────
  {
    const allByFreq = [...hotNums, ...coldNums.filter(n => !hotNums.includes(n))]
    const odd  = pickFrom(allByFreq.filter(n => n % 2 !== 0), 3, new Set())
    const even = pickFrom(allByFreq.filter(n => n % 2 === 0), 3, new Set(odd))
    results.push(ticket(
      [...odd, ...even],
      midStrong,
      'balanced',
      'Balanced',
      '3 odd + 3 even · frequency-weighted selection',
    ))
  }

  // ── T3: strict 3 low (1–18) + 3 high (19–37), preferring hot ──────────
  {
    const allByFreq = [...hotNums, ...coldNums.filter(n => !hotNums.includes(n))]
    const low  = pickFrom(allByFreq.filter(n => n <= 18), 3, new Set())
    const high = pickFrom(allByFreq.filter(n => n >  18), 3, new Set(low))
    results.push(ticket(
      [...low, ...high],
      midStrong,
      'balanced',
      'Balanced',
      '3 low (1–18) + 3 high (19–37) · frequency-weighted',
    ))
  }

  return results
}

// ── Strategy: Risky ────────────────────────────────────────────────────────
// Three draws from the 15 least-frequent numbers — high variance, high odds.

function riskyTickets(coldNums, coldStrong) {
  const pool = coldNums.slice(0, 15)

  const selections = [
    pool.slice(0, 6),
    pool.slice(3, 9),
    [pool[0], pool[1], pool[5], pool[6], pool[7], pool[8]],
  ]

  const descs = [
    'Six least-drawn numbers · statistically overdue',
    'Second-tier cold numbers',
    'Coldest pair · spread of cold picks',
  ]

  return selections.map((nums, i) =>
    ticket(
      nums.filter(Boolean),
      coldStrong[i % coldStrong.length],
      'risky',
      'Contrarian',
      descs[i],
    )
  )
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate 12 recommended tickets (3 per strategy) from pre-computed stats.
 *
 * @param {ReturnType<import('./analyticsEngine.js').computeStats>} stats
 * @returns {{ smart, hot, balanced, risky }}
 */
export function generateRecommendations(stats) {
  const hotNums    = sortedNums(stats.frequency,       false)
  const coldNums   = sortedNums(stats.frequency,       true)
  const hotStrong  = sortedNums(stats.strongFrequency, false)
  const coldStrong = sortedNums(stats.strongFrequency, true)

  // Seed smart tickets from top pairs; fall back to top-2 hot numbers if no pair data
  const topPairs = (stats.commonPairs ?? []).length > 0
    ? stats.commonPairs.slice(0, 5).map(p => p.pair)
    : [hotNums.slice(0, 2), hotNums.slice(2, 4), hotNums.slice(4, 6)]

  return {
    smart:    smartTickets(hotNums, topPairs, hotStrong),
    hot:      hotTickets(hotNums, hotStrong),
    balanced: balancedTickets(hotNums, coldNums, hotStrong),
    risky:    riskyTickets(coldNums, coldStrong),
  }
}
