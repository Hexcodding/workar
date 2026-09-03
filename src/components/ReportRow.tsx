import { copyText } from '../lib/copy'
import { REPORT_COLUMNS, reportCells, reportFilled, reportRow } from '../lib/reportRow'
import type { CuratorNotes, Session } from '../store/sessionStore'

type Props = {
  session: Session
  onChange: (notes: CuratorNotes) => void
  onCopied: (msg: string) => void
}

/**
 * Готовая строка в буфер: встал на первую ячейку своей строки, вставил —
 * и колонки от «Даты» до «Комментария» встали по местам.
 *
 * Перед вставкой показываем, что именно уйдёт в каждую ячейку: строка идёт
 * в боевой лист, и вслепую туда лить нельзя.
 */
export function ReportRowPanel({ session, onChange, onCopied }: Props) {
  const cells = reportCells(session)
  const filled = reportFilled(session)
  const notes = session.notes

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="panel__title" style={{ margin: 0 }}>
          Строка для таблицы
        </p>
        <span className="pill">
          <strong>{filled}</strong>/{REPORT_COLUMNS.length}
        </span>
      </div>

      {/* итог и сумму программа угадывает по разговору, но последнее слово за тобой */}
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="result">Итог</label>
          <input
            id="result"
            value={notes.result}
            onChange={(e) => onChange({ ...notes, result: e.target.value })}
            placeholder="продажа / думает / отказ"
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="amount">Сумма чека</label>
          <input
            id="amount"
            value={notes.amount}
            onChange={(e) => onChange({ ...notes, amount: e.target.value })}
            placeholder={session.money?.total || 'если оформили'}
          />
        </div>
      </div>

      <table className="report-row">
        <tbody>
          {cells.map((c) => (
            <tr key={c.title} className={c.value ? '' : 'is-empty'}>
              <td>{c.title}</td>
              <td>{c.value || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => {
          void copyText(reportRow(session)).then((ok) =>
            onCopied(ok ? 'Строка скопирована — вставляй в «Дату»' : 'Не удалось скопировать'),
          )
        }}
      >
        Скопировать строку
      </button>
    </div>
  )
}
