import type { Dossier } from '../data/dossier'
import type { BrainResult } from '../lib/brain'
import type { DialogMetrics } from '../lib/dialogMeter'

type Props = {
  stageTitle: string
  metrics: DialogMetrics | null
  brain: BrainResult | null
  dossier: Dossier | null
  /** поле, которое только что записалось само */
  saved: { title: string; value: string } | null
}

/**
 * Тонкая строка над карточкой: где мы в разговоре и что уже записано.
 *
 * Отдельная ценность — «записал: домашка 3 часа». Пока Егор не видит, что
 * ответ мамы попал в карточку, он держит его в голове и тянется к блокноту,
 * а это ровно та секунда, в которую мама успевает остыть.
 */
export function CallStrip({ stageTitle, metrics, brain, dossier, saved }: Props) {
  if (saved) {
    return (
      <div className="call-strip call-strip--saved">
        <span className="pill pill-live">записал</span>
        <span>
          {saved.title}: {saved.value}
        </span>
      </div>
    )
  }

  return (
    <div className="call-strip">
      <span className="pill">{stageTitle}</span>
      {metrics?.clientAudible ? (
        <span className={`pill ${metrics.monologue ? 'pill-danger' : ''}`}>
          мама {Math.round(metrics.clientShare * 100)}%
        </span>
      ) : (
        <span className="pill" title="Включи захват звука системы, чтобы слышать маму">
          мамы не слышно
        </span>
      )}
      {brain?.pointBCard ? (
        <span className={`pill ${brain.pointBCard.done >= 4 ? 'pill-live' : ''}`}>
          точка Б {brain.pointBCard.done}/{brain.pointBCard.total}
        </span>
      ) : null}
      {dossier ? (
        <span className="pill">
          карточка {dossier.done}/{dossier.total}
        </span>
      ) : null}
      {brain?.risk && brain.risk.level !== 'ok' ? (
        <span className={`pill ${brain.risk.level === 'danger' ? 'pill-danger' : ''}`}>
          слив {brain.risk.score}%
        </span>
      ) : null}
    </div>
  )
}
