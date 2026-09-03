type Props = {
  lines: string[]
  partial: string
}

/** Что программа услышала: нужна не в разговоре, а когда есть сомнение. */
export function Transcript({ lines, partial }: Props) {
  return (
    <div className="transcript">
      <div className="cheat-label">Распознано</div>
      <div className="transcript__body">
        {lines.slice(-12).map((line, i) => (
          <p key={`${i}-${line.slice(0, 12)}`}>{line}</p>
        ))}
        {partial ? <p className="transcript__partial">{partial}</p> : null}
        {!lines.length && !partial ? <p className="muted">Пока тихо.</p> : null}
      </div>
    </div>
  )
}
