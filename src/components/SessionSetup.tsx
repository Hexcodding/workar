import { useState } from 'react'
import type { Session } from '../store/sessionStore'
import { BrainSettings } from './BrainSettings'

type Props = {
  defaultSeller: string
  historyCount: number
  onStart: (data: { momName: string; childName: string; sellerName: string }) => void
  onOpenHistory: () => void
  resumeSession: Session | null
  onResume: () => void
}

export function SessionSetup({
  defaultSeller,
  historyCount,
  onStart,
  onOpenHistory,
  resumeSession,
  onResume,
}: Props) {
  const [momName, setMomName] = useState('')
  const [childName, setChildName] = useState('')
  const [sellerName, setSellerName] = useState(defaultSeller)

  return (
    <div className="stack hero-setup">
      <h1>Workar</h1>
      <p>Личный копайлот с мозгом: слушает, понимает этап и подсказывает, что сказать.</p>
      <BrainSettings />

      {resumeSession ? (
        <div className="panel stack">
          <p className="panel__title">Незавершённая встреча</p>
          <div>
            <strong>
              {resumeSession.momName || 'Без имени'} · {resumeSession.childName || '—'}
            </strong>
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              {new Date(resumeSession.updatedAt).toLocaleString('ru-RU')}
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={onResume}>
            Продолжить
          </button>
        </div>
      ) : null}

      <div className="panel stack">
        <p className="panel__title">Новая встреча</p>
        <div className="field">
          <label htmlFor="mom">Имя мамы</label>
          <input
            id="mom"
            value={momName}
            onChange={(e) => setMomName(e.target.value)}
            placeholder="Например, Анна"
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="child">Имя ребёнка</label>
          <input
            id="child"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="Например, Максим"
          />
        </div>
        <div className="field">
          <label htmlFor="seller">Твоё имя</label>
          <input
            id="seller"
            value={sellerName}
            onChange={(e) => setSellerName(e.target.value)}
            placeholder="Как представляешься"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!momName.trim()}
          onClick={() =>
            onStart({
              momName: momName.trim(),
              childName: childName.trim(),
              sellerName: sellerName.trim(),
            })
          }
        >
          Начать встречу
        </button>
      </div>

      <button type="button" className="btn btn-ghost btn-block" onClick={onOpenHistory}>
        История ({historyCount})
      </button>
    </div>
  )
}
