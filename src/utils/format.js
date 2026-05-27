export function formatTimestamp(ts) {
  if (!ts) return ''
  const ms = (ts._seconds ?? ts.seconds ?? 0) * 1000
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
