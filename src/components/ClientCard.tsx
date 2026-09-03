import type { Session } from '../store/sessionStore'
import { overallProgress } from '../store/sessionStore'

type Props = {
  session: Session
}

export function ClientCard({ session }: Props) {
  const { done, total } = overallProgress(session)
  return (
    <div className="panel">
      <p className="panel__title">Клиент</p>
      <div className="stack" style={{ gap: 6 }}>
        <div>
          <strong>{session.momName || '—'}</strong>
          <span className="muted"> · мама</span>
        </div>
        <div>
          <strong>{session.childName || '—'}</strong>
          <span className="muted"> · ребёнок</span>
        </div>
        <div className="row wrap">
          <span className="pill">
            Чек-лист <strong>{done}/{total}</strong>
          </span>
          <span className="pill">
            Ты <strong>{session.sellerName || '—'}</strong>
          </span>
        </div>
      </div>
    </div>
  )
}
