import type { NowCard } from '../lib/nowCard'

type Props = {
  card: NowCard | null
  /** сколько подсказок ждёт своей очереди */
  rest: number
  onNext: () => void
  onWorked: (say: string) => void
}

/**
 * Единственное, что видно во время разговора.
 *
 * Одно действие крупно, дословная фраза под ним и одна строка «почему».
 * Всё остальное — карточка ребёнка, чек-лист, лента распознанного — живёт
 * на соседних вкладках: в разговоре на них всё равно нет времени.
 */
export function NowCardPanel({ card, rest, onNext, onWorked }: Props) {
  if (!card) {
    return (
      <div className="panel now-card">
        <p className="muted" style={{ margin: 0 }}>
          Включи слушалку — подскажу, что спросить.
        </p>
      </div>
    )
  }

  return (
    <div className={`panel now-card now-card--${card.kind}`}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="now-card__label">{card.label}</span>
        {rest > 0 ? (
          <button type="button" className="btn-worked" onClick={onNext}>
            дальше · {rest}
          </button>
        ) : null}
      </div>

      <p className="now-card__headline">{card.headline}</p>

      {/* вторая строка — чем добить, если первая зашла: держим её тише первой */}
      {card.say ? (
        <p className="now-card__say">
          {card.say.split('\n').map((line, i) => (
            <span key={line} className={i ? 'now-card__then' : undefined}>
              {line}
            </span>
          ))}
          <button
            type="button"
            className="btn-worked"
            title="Запомнить как рабочую фразу"
            onClick={() => onWorked(card.say ?? '')}
          >
            сработало
          </button>
        </p>
      ) : null}

      {card.because ? <p className="now-card__because">{card.because}</p> : null}
    </div>
  )
}
