import { GOLDEN_PATH, nextTrainStep } from '../data/trainingPath'
import type { Session } from '../store/sessionStore'

type Props = {
  session: Session
}

export function TrainingPath({ session }: Props) {
  const current = nextTrainStep(session.checked)
  return (
    <div className="panel stack">
      <p className="panel__title">Путь обучения · 10 шагов</p>
      <div className="coach-focus">
        <div className="cheat-label">
          Сейчас шаг {current.order}/10 · {current.title}
        </div>
        <div className="coach-focus__text">{current.coachFocus}</div>
        <div className="alert-say">Скажи: {current.say}</div>
      </div>
      <div className="train-steps">
        {GOLDEN_PATH.map((step) => {
          const done = step.gateItemIds?.length
            ? step.gateItemIds.every((id) => session.checked[id])
            : step.order < current.order
          const active = step.id === current.id
          return (
            <div
              key={step.id}
              className={`train-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
            >
              <span>{step.order}</span>
              <span>{step.title}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
