import { useState, useEffect } from 'react'
import './dashboard.css'

// Pais Lotto draws: Tuesday (2) and Saturday (6) at 22:00 Israel time
const DRAW_DAYS = [2, 6]
const DRAW_HOUR = 22

function getNextDraw() {
  const now   = new Date()
  const isr   = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  const day   = isr.getDay()
  const hour  = isr.getHours()
  const min   = isr.getMinutes()

  for (let offset = 0; offset <= 7; offset++) {
    const checkDay = (day + offset) % 7
    if (!DRAW_DAYS.includes(checkDay)) continue
    if (offset === 0 && (hour > DRAW_HOUR || (hour === DRAW_HOUR && min >= 0))) continue

    const next = new Date(isr)
    next.setDate(next.getDate() + offset)
    next.setHours(DRAW_HOUR, 0, 0, 0)
    return next
  }
  return null
}

function formatCountdown(ms) {
  if (ms <= 0) return { d: 0, h: 0, m: 0 }
  const totalMin = Math.floor(ms / 60000)
  return {
    d: Math.floor(totalMin / 1440),
    h: Math.floor((totalMin % 1440) / 60),
    m: totalMin % 60,
  }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function NextDrawCard() {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const next = getNextDraw()
  if (!next) return null

  const msLeft  = next.getTime() - now
  const { d, h, m } = formatCountdown(msLeft)
  const dayName = DAY_NAMES[next.getDay()]

  return (
    <div className="card db-card db-nextdraw-card">
      <div className="db-card-header">
        <span className="db-card-title">Next Draw</span>
        <span className="db-card-meta">{dayName} 22:00 · Israel time</span>
      </div>

      <div className="db-countdown-row">
        {d > 0 && (
          <div className="db-countdown-unit">
            <span className="db-countdown-num">{d}</span>
            <span className="db-countdown-lbl">day{d !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="db-countdown-unit">
          <span className="db-countdown-num">{h}</span>
          <span className="db-countdown-lbl">hr</span>
        </div>
        <div className="db-countdown-unit">
          <span className="db-countdown-num">{m}</span>
          <span className="db-countdown-lbl">min</span>
        </div>
      </div>
    </div>
  )
}
