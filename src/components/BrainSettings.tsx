import { useState } from 'react'
import {
  defaultModelFor,
  loadSettings,
  saveSettings,
  type AppSettings,
  type BrainProvider,
} from '../store/settingsStore'

type Props = {
  compact?: boolean
}

const providers: Array<{ id: BrainProvider; label: string; hint: string }> = [
  {
    id: 'offline',
    label: 'Офлайн (бесплатно, без VPN)',
    hint: 'Без ключей и без Gemini. Слушалка + подсказки по твоим разборам — пользуйся так.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek (обычно доступен)',
    hint: 'Ключ: platform.deepseek.com — часто работает без танцев с VPN, очень дёшево.',
  },
  {
    id: 'groq',
    label: 'Groq',
    hint: 'console.groq.com/keys — если откроется из твоей сети.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    hint: 'Часто режет по региону — можно не мучить.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'Когда будут деньги.',
  },
]

export function BrainSettings({ compact: _compact }: Props) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [saved, setSaved] = useState(false)

  function update(partial: Partial<AppSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      if (partial.provider && partial.provider !== prev.provider) {
        next.openaiModel = defaultModelFor(partial.provider)
      }
      saveSettings(next)
      return next
    })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  const current = providers.find((p) => p.id === settings.provider) ?? providers[0]
  const needsKey = settings.provider !== 'offline'

  return (
    <div className="panel stack">
      <p className="panel__title">Мозг</p>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Без денег на OpenAI бери <strong>Офлайн</strong> или бесплатный <strong>Gemini</strong>.
      </p>

      <div className="field">
        <label htmlFor="provider">Провайдер</label>
        <select
          id="provider"
          value={settings.provider}
          onChange={(e) => update({ provider: e.target.value as BrainProvider })}
          style={{
            width: '100%',
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            borderRadius: 10,
            padding: '10px 12px',
            color: 'inherit',
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {current.hint}
      </p>

      {needsKey ? (
        <>
          <div className="field">
            <label htmlFor="apikey">API key</label>
            <input
              id="apikey"
              type="password"
              value={settings.apiKey}
              placeholder={settings.provider === 'openai' ? 'sk-...' : 'вставь ключ'}
              onChange={(e) => update({ apiKey: e.target.value.trim() })}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="model">Модель</label>
            <input
              id="model"
              value={settings.openaiModel}
              onChange={(e) =>
                update({
                  openaiModel: e.target.value.trim() || defaultModelFor(settings.provider),
                })
              }
            />
          </div>
        </>
      ) : (
        <div className="alert alert-tip">
          <strong>Офлайн-мозг активен</strong>
          <div>
            Слушалка + подсказки по твоим разборам работают без оплаты. Потом можно переключить на
            Gemini бесплатно.
          </div>
        </div>
      )}

      <label className="row" style={{ gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.brainEnabled}
          onChange={(e) => update({ brainEnabled: e.target.checked })}
        />
        <span>Мозг включён</span>
      </label>

      <label className="row" style={{ gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.listenParent}
          onChange={(e) => update({ listenParent: e.target.checked })}
        />
        <span>Слушать маму (петля системного звука)</span>
      </label>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Ты в наушниках, поэтому речь мамы берётся из звука системы и распознаётся локально —
        в интернет ничего не уходит. Нужен установленный Python с faster-whisper.
      </p>
      {saved ? <span className="pill">сохранено</span> : null}
    </div>
  )
}
