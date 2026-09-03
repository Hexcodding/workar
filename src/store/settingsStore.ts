const KEY = 'workar.settings.v1'

export type BrainProvider = 'offline' | 'deepseek' | 'groq' | 'gemini' | 'openai'

export type AppSettings = {
  provider: BrainProvider
  apiKey: string
  /** legacy */
  openaiApiKey?: string
  openaiModel: string
  brainEnabled: boolean
  /** слушать маму через петлю системного звука и локальный распознаватель */
  listenParent: boolean
}

const defaults: AppSettings = {
  provider: 'offline',
  apiKey: '',
  openaiModel: '',
  brainEnabled: true,
  listenParent: true,
}

const providerDefaults: Record<BrainProvider, string> = {
  offline: '',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaults }
    const parsed = { ...defaults, ...(JSON.parse(raw) as Partial<AppSettings>) }
    // migrate old field
    if (!parsed.apiKey && parsed.openaiApiKey) {
      parsed.apiKey = parsed.openaiApiKey
      parsed.provider = 'openai'
    }
    return parsed
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function defaultModelFor(provider: BrainProvider) {
  return providerDefaults[provider]
}

/** Offline always "has brain". Cloud needs key. */
export function hasBrainKey(settings: AppSettings = loadSettings()) {
  if (settings.provider === 'offline') return true
  return Boolean((settings.apiKey || settings.openaiApiKey || '').trim())
}
