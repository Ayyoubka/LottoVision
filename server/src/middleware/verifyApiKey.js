/**
 * Middleware that authenticates requests from trusted automation (e.g. GitHub Actions).
 *
 * Expects:  Authorization: ApiKey <IMPORT_API_KEY>
 * Returns 503 if the server env var is not configured.
 * Returns 401 if the key is missing or does not match.
 */
export function verifyApiKey(req, res, next) {
  const header = req.headers.authorization ?? ''
  const key    = header.startsWith('ApiKey ') ? header.slice(7) : null
  const stored = process.env.IMPORT_API_KEY

  if (!stored) {
    return res.status(503).json({ error: 'IMPORT_API_KEY_NOT_CONFIGURED' })
  }

  if (!key || key !== stored) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or missing API key' })
  }

  next()
}
