import { useEffect, useState } from 'react'

type Props = {
  startedAt: string | null
  painsHint?: boolean
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SessionTimer({ startedAt, painsHint }: Props) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  if (!startedAt) return null

  const elapsed = now - new Date(startedAt).getTime()
  const minutes = elapsed / 60000
  const inPainsWindow = painsHint && minutes >= 20 && minutes <= 30
  const overPains = painsHint && minutes > 30

  return (
    <div className="row wrap">
      <span className="pill">
        Таймер <strong>{formatElapsed(elapsed)}</strong>
      </span>
      {painsHint ? (
        <span className="pill">
          Боли{' '}
          <strong>
            {inPainsWindow ? 'окно 20–30' : overPains ? '> 30 мин' : 'до 20–30'}
          </strong>
        </span>
      ) : null}
    </div>
  )
}
