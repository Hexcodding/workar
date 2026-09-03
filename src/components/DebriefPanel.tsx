import { DOSSIER_FIELDS } from '../data/dossier'
import { buildDebrief, computePersonalStats } from '../lib/debrief'
import type { Session } from '../store/sessionStore'

type Props = {
  session: Session
  history: Session[]
}

export function DebriefPanel({ session, history }: Props) {
  const debrief = buildDebrief(session)
  const stats = computePersonalStats(history)
  const card = session.card ?? []
  const heard = new Set(card.map((e) => e.id))
  // спросить было о чем, но так и не спросил: это и есть дыры в диагностике
  const unasked = DOSSIER_FIELDS.filter((f) => f.ask && !heard.has(f.id))

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="panel__title" style={{ margin: 0 }}>
          Разбор звонка
        </p>
        <div className="row" style={{ gap: 6 }}>
          <span className={`pill ${debrief.sale ? 'pill-live' : 'pill-danger'}`}>
            {debrief.sale ? 'продажа' : 'не продажа'}
          </span>
          <span className="pill">структура {debrief.score}%</span>
        </div>
      </div>

      <div className="coach-focus">
        <div className="cheat-label">Вердикт</div>
        <div className="coach-focus__text">{debrief.verdict}</div>
      </div>

      {debrief.focus.length ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="cheat-label">Фокус на следующий звонок</div>
          {debrief.focus.map((f) => (
            <div key={f} className="alert alert-warn">
              {f}
            </div>
          ))}
        </div>
      ) : (
        <div className="alert alert-tip">Все шаги пути пройдены. Редкий звонок.</div>
      )}

      {card.length ? (
        <div className="stack" style={{ gap: 4 }}>
          <div className="cheat-label">Что сказала мама</div>
          {card.map((e) => (
            <div key={e.id} className="stack" style={{ gap: 0 }}>
              <span style={{ fontSize: 13 }}>
                <span className="muted">{e.title}: </span>
                {e.value}
              </span>
              {e.quote && e.quote !== e.value ? (
                <span className="muted" style={{ fontSize: 11 }}>
                  «{e.quote.slice(0, 160)}»
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {unasked.length ? (
        <div className="stack" style={{ gap: 4 }}>
          <div className="cheat-label">Не спросил</div>
          {unasked.slice(0, 6).map((f) => (
            <span key={f.id} style={{ fontSize: 13 }}>
              <span className="muted">{f.title}: </span>
              {f.ask}
            </span>
          ))}
        </div>
      ) : null}

      <div className="stack" style={{ gap: 4 }}>
        <div className="cheat-label">Ты за {stats.calls} звонков</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="pill">продажи {stats.sales}</span>
          <span className="pill">конверсия {stats.conversion}%</span>
          <span className="pill">структура {stats.avgScore}%</span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="pill">точка Б {stats.pointBRate}%</span>
          <span className={`pill ${stats.scaleRate < 50 ? 'pill-danger' : ''}`}>
            шкала {stats.scaleRate}%
          </span>
          <span className="pill">4 вопроса {stats.precloseRate}%</span>
          <span className="pill">ЛПР {stats.lprRate}%</span>
        </div>
        <p className="muted">Самое слабое место: {stats.weakest}</p>
      </div>
    </div>
  )
}
