import { useEffect, useState } from 'react'

type Props = {
  subtitle?: string
}

export function TitleBar({ subtitle }: Props) {
  const [pinned, setPinned] = useState(true)
  const hasDesktop = Boolean(window.workar)

  useEffect(() => {
    if (!window.workar) return
    void window.workar.getAlwaysOnTop().then(setPinned)
  }, [])

  async function togglePin() {
    if (!window.workar) return
    const next = await window.workar.setAlwaysOnTop(!pinned)
    setPinned(next)
  }

  return (
    <header className="titlebar drag-region">
      <div className="titlebar__brand">
        <span className="titlebar__name">Workar</span>
        {subtitle ? <span className="titlebar__meta">{subtitle}</span> : null}
      </div>
      <div className="titlebar__actions no-drag">
        {hasDesktop ? (
          <button
            type="button"
            className={`icon-btn ${pinned ? 'is-active' : ''}`}
            title={pinned ? 'Поверх всех: вкл' : 'Поверх всех: выкл'}
            onClick={() => void togglePin()}
            aria-label="Переключить поверх всех"
          >
            {pinned ? 'Пин' : 'Обыч'}
          </button>
        ) : null}
        {hasDesktop ? (
          <button
            type="button"
            className="icon-btn"
            title="Свернуть"
            onClick={() => void window.workar?.minimize()}
            aria-label="Свернуть"
          >
            _
          </button>
        ) : null}
        {hasDesktop ? (
          <button
            type="button"
            className="icon-btn"
            title="Закрыть"
            onClick={() => void window.workar?.close()}
            aria-label="Закрыть"
          >
            x
          </button>
        ) : null}
      </div>
    </header>
  )
}
