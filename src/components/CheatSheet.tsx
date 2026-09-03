import { fillTemplate, findItem } from '../data/checklist'
import type { Session } from '../store/sessionStore'

type Props = {
  session: Session
}

export function CheatSheet({ session }: Props) {
  const found = findItem(session.activeItemId)
  if (!found) {
    return (
      <div className="panel">
        <p className="muted">Выбери пункт чек-листа</p>
      </div>
    )
  }

  const text = fillTemplate(found.item.cheat, {
    mom: session.momName,
    child: session.childName,
    seller: session.sellerName,
  })

  return (
    <div className="panel">
      <div className="cheat-label">Шпаргалка · {found.item.title}</div>
      <div className="cheat">{text}</div>
    </div>
  )
}
