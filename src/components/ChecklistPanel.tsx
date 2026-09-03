import type { ChecklistStage } from '../data/checklist'
import type { Session } from '../store/sessionStore'

type Props = {
  stage: ChecklistStage
  session: Session
  onFocus: (itemId: string) => void
  onToggle: (itemId: string) => void
}

export function ChecklistPanel({ stage, session, onFocus, onToggle }: Props) {
  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="panel__title" style={{ margin: 0 }}>
          {stage.title}
        </p>
        {stage.durationHint ? <span className="pill">{stage.durationHint}</span> : null}
      </div>
      <div className="check-list">
        {stage.items.map((item) => {
          const done = Boolean(session.checked[item.id])
          const active = session.activeItemId === item.id
          return (
            <div
              key={item.id}
              className={`check-item ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onFocus(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onFocus(item.id)
                }
              }}
            >
              <button
                type="button"
                className="check-box"
                aria-label={done ? 'Снять отметку' : 'Отметить'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(item.id)
                }}
              >
                {done ? '✓' : ''}
              </button>
              <div>
                <div className="check-item__title">{item.title}</div>
                {item.highlight && !done ? (
                  <div className="check-item__hint">важный пункт</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
