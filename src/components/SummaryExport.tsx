import { copyText } from '../lib/copy'
import { buildSummary, type Session } from '../store/sessionStore'

type Props = {
  session: Session
  onCopied: (message: string) => void
}

export function SummaryExport({ session, onCopied }: Props) {
  async function copy() {
    const ok = await copyText(buildSummary(session))
    onCopied(ok ? 'Саммари скопировано' : 'Не удалось скопировать — выдели текст вручную')
  }

  return (
    <button type="button" className="btn btn-primary btn-block" onClick={() => void copy()}>
      Скопировать саммари куратору
    </button>
  )
}
