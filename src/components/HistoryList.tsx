import type { Session } from '../store/sessionStore'
import { overallProgress } from '../store/sessionStore'

type Props = {
  items: Session[]
  onOpen: (session: Session) => void
  onBack: () => void
}

export function HistoryList({ items, onOpen, onBack }: Props) {
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 22 }}>История</h2>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Назад
        </button>
      </div>
      {items.length === 0 ? (
        <div className="panel muted">Пока пусто — завершённые встречи появятся здесь.</div>
      ) : (
        <div className="stack">
          {items.map((session) => {
            const { done, total } = overallProgress(session)
            return (
              <button
                key={session.id}
                type="button"
                className="history-item"
                onClick={() => onOpen(session)}
              >
                <span className="history-item__title">
                  {session.momName || 'Без имени'} · {session.childName || '—'}
                </span>
                <span className="history-item__meta">
                  {new Date(session.updatedAt).toLocaleString('ru-RU')} · чек-лист {done}/{total}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
