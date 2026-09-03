import { dossierText, SECTION_TITLE, type Dossier } from '../data/dossier'

type Props = {
  dossier: Dossier | null
  onCopy?: (text: string) => void
}

/**
 * Карточка ребёнка и мамы: то, что Егор раньше писал руками в блокнот.
 * Показываем только заполненное — пустые поля висели бы упрёком,
 * поэтому чего не хватает, подсказываем одной строкой снизу.
 */
export function DossierPanel({ dossier, onCopy }: Props) {
  if (!dossier || !dossier.entries.length) return null

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="panel__title" style={{ margin: 0 }}>
          Карточка
        </p>
        <div className="row" style={{ gap: 6 }}>
          {dossier.pointBFound ? <span className="pill pill-live">точка Б есть</span> : null}
          <span className="pill">
            <strong>{dossier.done}</strong>/{dossier.total}
          </span>
        </div>
      </div>

      {dossier.bySection.map(({ section, entries }) => (
        <div key={section} className="stack" style={{ gap: 2 }}>
          <span className="muted" style={{ fontSize: 11 }}>
            {SECTION_TITLE[section]}
          </span>
          {entries.map((e) => (
            <div key={e.field.id} className="row" style={{ gap: 6, alignItems: 'baseline' }}>
              <span className="muted" style={{ minWidth: 96, fontSize: 11 }}>
                {e.field.title}
              </span>
              {/* полная цитата — во всплывающей подсказке: в строке она не помещается */}
              <span title={e.quote} style={{ flex: 1 }}>
                {e.value}
                {e.role === 'kid' ? <span className="muted"> · ребёнок</span> : null}
                {/* мама не проговорила это сама, а согласилась с формулировкой Егора */}
                {e.source === 'agreed' ? <span className="muted"> · с ваших слов</span> : null}
              </span>
            </div>
          ))}
        </div>
      ))}

      {dossier.missing.length ? (
        <p className="muted" style={{ fontSize: 11, margin: 0 }}>
          не хватает: {dossier.missing.slice(0, 4).map((f) => f.title).join(', ')}
        </p>
      ) : null}

      {onCopy ? (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => onCopy(dossierText(dossier))}
        >
          Скопировать карточку
        </button>
      ) : null}
    </div>
  )
}
