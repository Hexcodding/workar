import type { CuratorNotes, Session } from '../store/sessionStore'

type Props = {
  session: Session
  onChange: (notes: CuratorNotes) => void
}

export function CuratorNotesPanel({ session, onChange }: Props) {
  const notes = session.notes

  function patch(partial: Partial<CuratorNotes>) {
    onChange({ ...notes, ...partial })
  }

  return (
    <div className="panel stack">
      <p className="panel__title">Для куратора</p>
      <div className="field">
        <label htmlFor="pains">Боли / точка А</label>
        <textarea
          id="pains"
          value={notes.pains}
          onChange={(e) => patch({ pains: e.target.value })}
          placeholder="Что беспокоит маму"
        />
      </div>
      <div className="field">
        <label htmlFor="pointB">Точка Б</label>
        <textarea
          id="pointB"
          value={notes.pointB}
          onChange={(e) => patch({ pointB: e.target.value })}
          placeholder="Какой результат хочет"
        />
      </div>
      <div className="field">
        <label htmlFor="readiness">Готовность 0–10</label>
        <input
          id="readiness"
          value={notes.readiness}
          onChange={(e) => patch({ readiness: e.target.value })}
          placeholder="Например, 8"
        />
      </div>
      <div className="field">
        <label htmlFor="objections">Возражения</label>
        <textarea
          id="objections"
          value={notes.objections}
          onChange={(e) => patch({ objections: e.target.value })}
          placeholder="Что мешает"
        />
      </div>
      <div className="field">
        <label htmlFor="agreement">Договорённость</label>
        <textarea
          id="agreement"
          value={notes.agreement}
          onChange={(e) => patch({ agreement: e.target.value })}
          placeholder="На чём остановились"
        />
      </div>
      <div className="field">
        <label htmlFor="nextStep">Следующий шаг</label>
        <textarea
          id="nextStep"
          value={notes.nextStep}
          onChange={(e) => patch({ nextStep: e.target.value })}
          placeholder="Что сделать дальше"
        />
      </div>
      {/* итог и сумма — это отчётность Егора, они живут в панели таблицы */}
      <div className="field">
        <label htmlFor="free">Заметки</label>
        <textarea
          id="free"
          value={notes.freeNotes}
          onChange={(e) => patch({ freeNotes: e.target.value })}
          placeholder="Любые детали"
        />
      </div>
    </div>
  )
}
