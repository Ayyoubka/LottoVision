import axios       from 'axios'
import * as cheerio from 'cheerio'

const BASE_URL = 'https://www.pais.co.il'

const REQUEST_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xhtml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control':   'no-cache',
}

async function get(url) {
  // responseType:'arraybuffer' + manual toString() works for both UTF-8 and Win-1255
  // because latin1 preserves all byte values as-is; cheerio's decodeEntities
  // will normalise named HTML entities, and numeric Hebrew chars will come
  // through correctly as long as the HTML declares its charset in a <meta> tag.
  // For the Hebrew string matches we convert to UTF-8 via cheerio's internal
  // encoding pipeline (cheerio infers charset from the <meta> tag).
  const { data, headers } = await axios.get(url, {
    headers:      REQUEST_HEADERS,
    timeout:      12_000,
    responseType: 'arraybuffer',
    decompress:   true,
  })

  // Detect charset from Content-Type header
  const ct      = headers['content-type'] ?? ''
  const csMatch = ct.match(/charset=([^\s;]+)/i)
  const charset = csMatch ? csMatch[1].toLowerCase() : 'utf-8'

  // Decode bytes → string using the detected charset
  const html = Buffer.from(data).toString(
    charset === 'windows-1255' || charset === 'iso-8859-8' ? 'binary' : 'utf-8'
  )

  return html
}

/**
 * Fetch the main lotto page and return the highest lotteryId in any href
 * (which is always the current draw).
 */
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

  // Fallback: look for draw number in <h3> / page text
  if (!latestId) {
    const allText = $.root().text()
    const match   = allText.match(/מס['\s]+(\d{3,5})/)  // "מס' XXXX"
    if (match) latestId = parseInt(match[1], 10)
  }

  if (!latestId) throw new Error('Could not resolve latest draw ID from pais.co.il')
  return latestId
}

/**
 * Scrape a specific draw-result page.
 *
 * Live structure (confirmed via server-side fetch):
 *   <h3>תוצאות הגרלה מס' 3928</h3>
 *   ...לתאריך 24/05/2026...
 *   <ol>
 *     <li>2</li><li>5</li><li>6</li><li>8</li><li>30</li><li>37</li>
 *   </ol>
 *   <h4>6</h4>
 *   <p>המספר החזק</p>
 */
async function parseDrawPage(drawId) {
  const url  = `${BASE_URL}/Lotto/CurrentLotto.aspx?lotteryId=${drawId}`
  const html = await get(url)
  const $    = cheerio.load(html)

  // ── Draw ID & date ──────────────────────────────────────────────────────
  let parsedDrawId = drawId
  let date         = null

  const allText = $.root().text()

  // Draw ID: e.g. "מס' 3928" or "מס 3928"
  const idMatch = allText.match(/מס['\s]+(\d{3,5})/)
  if (idMatch) parsedDrawId = parseInt(idMatch[1], 10)

  // Date: DD/MM/YYYY anywhere on the page
  const dateMatch = allText.match(/(\d{2}\/\d{2}\/\d{4})/)
  if (dateMatch) date = dateMatch[1]

  // ── Main 6 numbers ──────────────────────────────────────────────────────
  let numbers = []

  // Strategy 1: find <ol> whose <li> children are all valid lotto numbers (1-37)
  $('ol').each((_, ol) => {
    if (numbers.length === 6) return false

    const candidates = []
    $(ol).find('li').each((_, li) => {
      const n = parseInt($(li).text().trim(), 10)
      if (!isNaN(n) && n >= 1 && n <= 37) candidates.push(n)
    })

    if (candidates.length === 6) numbers = candidates
  })

  // Strategy 2: any run of 6 numbers 1-37 found in text nodes
  if (numbers.length !== 6) {
    const numMatches = allText.match(/\b([1-9]|[1-2]\d|3[0-7])\b/g) ?? []
    const parsed     = numMatches.map(Number)
    if (parsed.length >= 6) numbers = parsed.slice(0, 6)
  }

  if (numbers.length !== 6) {
    throw new Error(`Could not parse 6 main numbers from draw #${drawId}`)
  }

  // ── Strong number ───────────────────────────────────────────────────────
  // The strong number is a 1-7 digit that appears just before the text
  // "המספר החזק" (Unicode: המספר החזק)
  let strongNumber = null

  // Strategy 1: element immediately preceding the strong-number label
  const STRONG_LABEL = 'המספר החזק'  // המספר החזק
  const STRONG_SHORT = 'חזק'                                          // חזק

  $('*').each((_, el) => {
    if (strongNumber !== null) return false
    const text = $(el).text().trim()
    if (text.includes(STRONG_LABEL) || text.includes(STRONG_SHORT)) {
      // Try the previous sibling
      const prevText = $(el).prev().text().trim()
      const n        = parseInt(prevText, 10)
      if (!isNaN(n) && n >= 1 && n <= 7) { strongNumber = n; return false }

      // Might be inline: "6 המספר החזק"
      const inlineMatch = text.match(/^(\d)\s/)
      if (inlineMatch) {
        const n2 = parseInt(inlineMatch[1], 10)
        if (n2 >= 1 && n2 <= 7) { strongNumber = n2; return false }
      }
    }
  })

  // Strategy 2: any <h4> or <strong> containing a lone digit 1-7
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

  // Strategy 3: regex on full-page text — find the number right before "חזק"
  if (strongNumber === null) {
    const strongRegex = /(\d)\s*חזק/  // digit + "חזק"
    const m           = allText.match(strongRegex)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n >= 1 && n <= 7) strongNumber = n
    }
  }

  if (strongNumber === null) {
    throw new Error(`Could not parse strong number from draw #${drawId}`)
  }

  return {
    drawId:       parsedDrawId,
    date:         date ?? 'Unknown',
    numbers:      [...numbers].sort((a, b) => a - b),
    strongNumber,
  }
}

/**
 * Public entry point — resolves the latest draw ID then scrapes its result page.
 * @returns {Promise<{ drawId: number, date: string, numbers: number[], strongNumber: number }>}
 */
export async function fetchLatestDraw() {
  const drawId = await resolveLatestDrawId()
  return parseDrawPage(drawId)
}

/**
 * Fetch and parse a specific draw by its sequential ID.
 * Throws if the page does not contain a valid Lotto draw for that ID.
 * @param {number} drawId
 * @returns {Promise<{ drawId: number, date: string, numbers: number[], strongNumber: number }>}
 */
export async function fetchDrawById(drawId) {
  const result = await parseDrawPage(drawId)
  // Guard: confirm the page actually belongs to the requested draw, not a redirect
  if (result.drawId !== drawId) {
    throw new Error(`ID mismatch — requested #${drawId}, page returned #${result.drawId}`)
  }
  return result
}

/**
 * Return the sequential ID of the most recent published Lotto draw.
 * @returns {Promise<number>}
 */
export { resolveLatestDrawId }
