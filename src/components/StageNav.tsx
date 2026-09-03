import { CHECKLIST } from '../data/checklist'
import { stageProgress, type Session } from '../store/sessionStore'

type Props = {
  session: Session
  activeStageId: string
  onSelect: (stageId: string) => void
}

export function StageNav({ session, activeStageId, onSelect }: Props) {
  return (
    <div className="stage-nav">
      {CHECKLIST.map((stage, index) => {
        const { done, total } = stageProgress(session, stage.id)
        const isDone = done === total && total > 0
        return (
          <button
            key={stage.id}
            type="button"
            className={`stage-chip ${activeStageId === stage.id ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
            onClick={() => onSelect(stage.id)}
          >
            {index + 1}. {stage.title.split(' ')[0]}
            {total > 0 ? ` ${done}/${total}` : ''}
          </button>
        )
      })}
    </div>
  )
}
