/**
 * prizeEngine.js — pure prize calculation, no I/O.
 *
 * This is the single source of truth for Pais Lotto prize tiers.
 * analyticsEngine.js keeps its own internal copy for the simulation feature;
 * both should be kept in sync when Pais updates prize amounts.
 *
 * To update prize amounts: edit PRIZE_TABLE entries below.
 * To add/remove tiers: add/remove entries AND update buildTierKey() if the
 * key format ever changes (e.g. if Pais introduces a new match-4 no-strong tier).
 *
 * Future — scheduled automatic checking:
 *   After every new draw is imported via syncLatestDraw(), query Firestore for
 *   all tickets with drawId === newDraw.drawId and status === 'pending', then
 *   call compareTicketToDraw() + updateTicketCheckResult() for each one.
 *   This can run as a Cloud Function triggered by a Firestore write to draws/{drawId}.
 */

// ── Prize table ────────────────────────────────────────────────────────────

/**
 * Official Pais Lotto prize structure — 8 classes.
 * Pool prizes (Classes 1–4) vary per draw; `amount` is a typical estimate.
 * Class 1 (jackpot) has a guaranteed floor of ₪3,000,000 and rolls over.
 * Fixed prizes (Classes 5–8) are set by Pais and rarely change.
 *
 * Source: pais.co.il/info/Prices.aspx
 *
 * Key format: "{mainMatched}" or "{mainMatched}+s" (strong number also matched).
 *
 * isJackpot: true → the actual amount is draw-dependent and may far exceed
 *   the `amount` floor. Future: fetch real jackpot from the draw document
 *   once pais.co.il exposes it in a parseable form.
 */
export const PRIZE_TABLE = {
  '6+s': { class: 1, label: 'Class 1 · Jackpot', amount: 3_000_000, isJackpot: true  },
  '6':   { class: 2, label: 'Class 2',            amount:   500_000, isJackpot: false },
  '5+s': { class: 3, label: 'Class 3',            amount:     5_300, isJackpot: false },
  '5':   { class: 4, label: 'Class 4',            amount:       600, isJackpot: false },
  '4+s': { class: 5, label: 'Class 5',            amount:       154, isJackpot: false },
  '4':   { class: 6, label: 'Class 6',            amount:        47, isJackpot: false },
  '3+s': { class: 7, label: 'Class 7',            amount:        39, isJackpot: false },
  '3':   { class: 8, label: 'Class 8',            amount:        10, isJackpot: false },
}

// ── Tier key ───────────────────────────────────────────────────────────────

/**
 * Build the PRIZE_TABLE lookup key from raw match counts.
 * Returns null when there is no prize for this combination.
 *
 * @param {number}  mainMatchCount  0–6
 * @param {boolean} strongMatched
 * @returns {string|null}
 */
function buildTierKey(mainMatchCount, strongMatched) {
  const key = strongMatched ? `${mainMatchCount}+s` : `${mainMatchCount}`
  return Object.prototype.hasOwnProperty.call(PRIZE_TABLE, key) ? key : null
}

// ── Core comparison ────────────────────────────────────────────────────────

/**
 * Compare a single ticket line against one draw and calculate the prize.
 *
 * @param {{ numbers: number[], strongNumber: number }} ticket
 * @param {{ numbers: number[], strongNumber: number, drawId: number, date: string }} draw
 * @param {Record<string,number>|null} [prizeTable]
 *   Optional per-draw prize amounts (keyed by tier, e.g. `{ '3': 15, '3+s': 56 }`).
 *   When provided, these ILS values override the hardcoded PRIZE_TABLE amounts.
 *   When omitted, the hardcoded PRIZE_TABLE values are used unchanged.
 *
 * @returns {{
 *   matchedNumbers: number[],
 *   matchedCount:   number,
 *   matchedStrong:  boolean,
 *   tier:           string|null,
 *   prizeClass:     number|null,
 *   prizeLabel:     string|null,
 *   winnings:       number,
 *   isJackpot:      boolean,
 * }}
 */
export function compareTicketToDraw(ticket, draw, prizeTable = null) {
  if (!ticket?.numbers || !draw?.numbers) {
    throw new Error('compareTicketToDraw: both ticket.numbers and draw.numbers are required')
  }

  const ticketSet      = new Set(ticket.numbers)
  const matchedNumbers = (draw.numbers).filter(n => ticketSet.has(n))
  const matchedCount   = matchedNumbers.length
  const matchedStrong  = ticket.strongNumber === draw.strongNumber

  console.log(
    `[PrizeEngine] Ticket [${ticket.numbers.join(',')}]+${ticket.strongNumber}` +
    `  vs  Draw #${draw.drawId} [${draw.numbers.join(',')}]+${draw.strongNumber}` +
    `  → matched main: [${matchedNumbers.join(',')}] (${matchedCount})` +
    `  strong: ${matchedStrong}`
  )

  const tierKey  = buildTierKey(matchedCount, matchedStrong)
  const prizeRow = tierKey ? PRIZE_TABLE[tierKey] : null

  // Use admin-entered amount when a per-draw table is provided; fall back to hardcoded.
  const winnings = tierKey
    ? (prizeTable?.[tierKey] ?? prizeRow?.amount ?? 0)
    : 0

  const result = {
    matchedNumbers,
    matchedCount,
    matchedStrong,
    tier:       tierKey,
    prizeClass: prizeRow?.class   ?? null,
    prizeLabel: prizeRow?.label   ?? null,
    winnings,
    isJackpot:  prizeRow?.isJackpot ?? false,
  }

  if (tierKey) {
    console.log(
      `[PrizeEngine] Prize: ${prizeRow?.label ?? tierKey}` +
      `  tier=${tierKey}  winnings=₪${winnings}` +
      `${prizeTable ? '  (dynamic table)' : '  (hardcoded table)'}`
    )
  } else {
    console.log(`[PrizeEngine] No prize (matched ${matchedCount} main${matchedStrong ? ' + strong' : ''})`)
  }

  return result
}
