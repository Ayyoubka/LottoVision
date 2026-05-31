'use strict'

/**
 * GitHub Actions relay script.
 *
 * 1. Resolves the latest draw ID from pais.co.il (or uses DRAW_ID env var).
 * 2. Parses the draw page: date, 6 main numbers, strong number.
 * 3. POSTs the draw JSON to POST /api/import/draw on the backend.
 *
 * Env vars (set as GitHub Actions secrets):
 *   BACKEND_URL     — e.g. https://lottovision-api.onrender.com
 *   IMPORT_API_KEY  — shared secret matching the server's IMPORT_API_KEY
 *   DRAW_ID         — (optional) specific draw ID to import; empty = latest
 */

const axios   = require('axios')
const cheerio = require('cheerio')

const BACKEND_URL    = process.env.BACKEND_URL
const IMPORT_API_KEY = process.env.IMPORT_API_KEY
const DRAW_ID_INPUT  = process.env.DRAW_ID ? parseInt(process.env.DRAW_ID, 10) : null

const BASE_URL = 'https://www.pais.co.il'

const REQUEST_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xhtml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control':   'no-cache',
}

// ── HTTP helper ────────────────────────────────────────────────────────────

async function get(url) {
  const { data, headers } = await axios.get(url, {
    headers:      REQUEST_HEADERS,
    timeout:      30_000,
    responseType: 'arraybuffer',
    decompress:   true,
  })

  const ct      = headers['content-type'] ?? ''
  const csMatch = ct.match(/charset=([^\s;]+)/i)
  const charset = csMatch ? csMatch[1].toLowerCase() : 'utf-8'

  return Buffer.from(data).toString(
    charset === 'windows-1255' || charset === 'iso-8859-8' ? 'binary' : 'utf-8'
  )
}

// ── Scraper ────────────────────────────────────────────────────────────────

async function resolveLatestDrawId() {
  const html = await get(`${BASE_URL}/lotto/`)
  const $    = cheerio.load(html)
  let latestId = 0

  $('a[href]').each((_, el) => {
    const href  = $(el).attr('href') ?? ''
    const match = href.match(/lotteryId=(\d+)/i)
    if (match) {
      const id = parseInt(match[1], 10)
      if (id > latestId) latestId = id
    }
  })

  if (!latestId) throw new Error('Could not resolve latest draw ID from pais.co.il')
  return latestId
}

async function parseDrawPage(drawId) {
  const url  = `${BASE_URL}/Lotto/CurrentLotto.aspx?lotteryId=${drawId}`
  const html = await get(url)
  const $    = cheerio.load(html)

  const allText = $.root().text()

  // ── Date ──────────────────────────────────────────────────────────────────
  const dateMatch = allText.match(/(\d{2}\/\d{2}\/\d{4})/)
  const date      = dateMatch ? dateMatch[1] : null

  if (!date) throw new Error(`Could not parse date from draw #${drawId}`)

  // ── Main 6 numbers ────────────────────────────────────────────────────────
  let numbers = []

  // Strategy 1: <ol> whose <li> children are all valid lotto numbers 1-37
  $('ol').each((_, ol) => {
    if (numbers.length === 6) return false
    const candidates = []
    $(ol).find('li').each((_, li) => {
      const n = parseInt($(li).text().trim(), 10)
      if (!isNaN(n) && n >= 1 && n <= 37) candidates.push(n)
    })
    if (candidates.length === 6) numbers = candidates
  })

  // Strategy 2: any run of 6 numbers 1-37 from page text
  if (numbers.length !== 6) {
    const numMatches = allText.match(/\b([1-9]|[1-2]\d|3[0-7])\b/g) ?? []
    const parsed     = numMatches.map(Number)
    if (parsed.length >= 6) numbers = parsed.slice(0, 6)
  }

  if (numbers.length !== 6) {
    throw new Error(`Could not parse 6 main numbers from draw #${drawId}`)
  }

  // ── Strong number ─────────────────────────────────────────────────────────
  let strongNumber = null

  // Strategy 1: element immediately preceding the strong-number label
  $('*').each((_, el) => {
    if (strongNumber !== null) return false
    const text = $(el).text().trim()
    if (text.includes('המספר החזק') ||
        text.includes('חזק')) {
      const prevText = $(el).prev().text().trim()
      const n        = parseInt(prevText, 10)
      if (!isNaN(n) && n >= 1 && n <= 7) { strongNumber = n; return false }

      const inlineMatch = text.match(/^(\d)\s/)
      if (inlineMatch) {
        const n2 = parseInt(inlineMatch[1], 10)
        if (n2 >= 1 && n2 <= 7) { strongNumber = n2; return false }
      }
    }
  })

  // Strategy 2: lone digit 1-7 in <h4>, <strong>, <b>
  if (strongNumber === null) {
    $('h4, strong, b').each((_, el) => {
      if (strongNumber !== null) return false
      const text = $(el).text().trim()
      if (/^\d$/.test(text)) {
        const n = parseInt(text, 10)
        if (n >= 1 && n <= 7) strongNumber = n
      }
    })
  }

  // Strategy 3: digit immediately before "חזק" in full-page text
  if (strongNumber === null) {
    const m = allText.match(/(\d)\s*חזק/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n >= 1 && n <= 7) strongNumber = n
    }
  }

  if (strongNumber === null) {
    throw new Error(`Could not parse strong number from draw #${drawId}`)
  }

  return {
    drawId,
    date,
    numbers: [...numbers].sort((a, b) => a - b),
    strongNumber,
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!BACKEND_URL)    throw new Error('BACKEND_URL env var is required')
  if (!IMPORT_API_KEY) throw new Error('IMPORT_API_KEY env var is required')

  // Step 1 — Resolve draw ID
  let drawId
  if (DRAW_ID_INPUT && !isNaN(DRAW_ID_INPUT)) {
    console.log(`[importDraw] Using provided drawId: ${DRAW_ID_INPUT}`)
    drawId = DRAW_ID_INPUT
  } else {
    console.log('[importDraw] Resolving latest draw ID from pais.co.il …')
    drawId = await resolveLatestDrawId()
    console.log(`[importDraw] Latest draw ID resolved: ${drawId}`)
  }

  // Step 2 — Parse draw page
  console.log(`[importDraw] Fetching draw page for ID ${drawId} …`)
  const draw = await parseDrawPage(drawId)
  console.log(`[importDraw] Parsed draw: ${JSON.stringify(draw)}`)

  // Step 3 — Wake up Render (free-tier cold start can take up to 50 s)
  console.log(`[importDraw] Pinging backend health endpoint …`)
  try {
    await axios.get(`${BACKEND_URL}/health`, { timeout: 60_000 })
    console.log('[importDraw] Backend is awake')
  } catch {
    console.warn('[importDraw] Health ping failed — proceeding anyway')
  }

  // Step 4 — Send draw to backend
  console.log(`[importDraw] Posting draw to ${BACKEND_URL}/api/import/draw …`)
  const response = await axios.post(
    `${BACKEND_URL}/api/import/draw`,
    draw,
    {
      headers: {
        'Authorization': `ApiKey ${IMPORT_API_KEY}`,
        'Content-Type':  'application/json',
      },
      timeout: 90_000,
    }
  )

  console.log(`[importDraw] Backend response (${response.status}): ${JSON.stringify(response.data)}`)

  const { inserted, skipped, pipelineResult } = response.data
  console.log(
    `[importDraw] Done — inserted=${inserted}  skipped=${skipped}` +
    `  ticketChecked=${pipelineResult?.ticketChecked}` +
    `  winnings=₪${pipelineResult?.winnings}` +
    `  error=${pipelineResult?.error ?? 'none'}`
  )
}

main().catch(err => {
  console.error(`[importDraw] FATAL: ${err.message}`)
  process.exit(1)
})
