import type { LocalSttStatus } from '../lib/localStt'

type Props = {
  listening: boolean
  onToggle: () => void
  status: 'idle' | 'listening' | 'unsupported' | 'denied'
  parentStatus: LocalSttStatus
  parentSpeaking: boolean
  brainStatus: 'off' | 'ready' | 'thinking' | 'error'
  brainBusy: boolean
  error: string | null
  onOpenSettings: () => void
}

/** Одна кнопка и три лампочки: слышу ли себя, слышу ли маму, жив ли мозг. */
export function ListenBar({
  listening,
  onToggle,
  status,
  parentStatus,
  parentSpeaking,
  brainStatus,
  brainBusy,
  error,
  onOpenSettings,
}: Props) {
  const parentLabel =
    parentStatus === 'listening'
      ? parentSpeaking
        ? 'мама говорит'
        : 'слышу маму'
      : parentStatus === 'starting'
        ? 'включаю слух мамы…'
        : parentStatus === 'error'
          ? 'мама не слышна'
          : parentStatus === 'unavailable'
            ? 'слух мамы только в приложении'
            : ''

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button
        type="button"
        className={`btn btn-block ${listening ? 'btn-danger' : 'btn-primary'}`}
        onClick={onToggle}
      >
        {listening ? 'Остановить слушалку' : 'Включить слушалку'}
      </button>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className={`pill ${status === 'listening' ? 'pill-live' : ''}`}>
          {status === 'listening'
            ? 'слышу тебя'
            : status === 'denied'
              ? 'нет микрофона'
              : status === 'unsupported'
                ? 'распознавание недоступно'
                : 'выкл'}
        </span>
        {parentLabel ? (
          <span
            className={`pill ${parentSpeaking ? 'pill-live' : ''} ${
              parentStatus === 'error' ? 'pill-danger' : ''
            }`}
          >
            {parentLabel}
          </span>
        ) : null}
        <span className={`pill ${brainStatus === 'ready' && !brainBusy ? 'pill-live' : ''}`}>
          {brainStatus === 'thinking' || brainBusy
            ? 'думает…'
            : brainStatus === 'ready'
              ? 'мозг онлайн'
              : brainStatus === 'error'
                ? 'ошибка мозга'
                : 'мозг выкл'}
        </span>
        <button type="button" className="btn-worked" onClick={onOpenSettings}>
          ключ
        </button>
      </div>

      {error ? <div className="alert alert-warn">{error}</div> : null}
    </div>
  )
}
