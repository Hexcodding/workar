import { BRAIN_SYSTEM_PROMPT, buildBrainUserPrompt } from '../data/brainPrompt'
import type { MomPain, PointBCard, VpQuestion } from '../data/mentorPack'
import type { CoachAlert } from '../data/playbook'
import { loadSettings } from '../store/settingsStore'
import type { ClientEcho } from './clientEcho'
import type { ClientProfile } from './clientProfile'
import type { DialogMetrics, SellingTip, Utterance } from './dialogMeter'
import { runOfflineBrain } from './offlineBrain'
import type { SlipRisk } from './riskMeter'
import type { TimelineStatus } from './timeline'

export type BrainResult = {
  stage: string
  situation: string
  priorityAction: string
  sayNext: string[]
  alerts: CoachAlert[]
  checkItems: string[]
  pointB: string
  readiness: string
  curatorNote: string
  sellingTip?: SellingTip
  risk?: SlipRisk
  profile?: ClientProfile
  echo?: ClientEcho
  timeline?: TimelineStatus | null
  /** слой наставника: боль за фразой мамы, слоты точки Б, следующий вопрос ВП */
  momPain?: MomPain | null
  pointBCard?: PointBCard
  vpNext?: VpQuestion | null
  rawError?: string
}

const emptyBrain = (): BrainResult => ({
  stage: 'greeting',
  situation: '',
  priorityAction: '',
  sayNext: [],
  alerts: [],
  checkItems: [],
  pointB: '',
  readiness: '',
  curatorNote: '',
})

function safeJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
  return JSON.parse(cleaned)
}

function parseBrainContent(content: string): BrainResult {
  try {
    const parsed = safeJson(content) as Record<string, unknown>
    const alertsRaw = Array.isArray(parsed.alerts) ? parsed.alerts : []
    const alerts: CoachAlert[] = alertsRaw
      .map((a, i) => {
        const row = a as Record<string, unknown>
        const level: CoachAlert['level'] =
          row.level === 'critical' || row.level === 'warn' || row.level === 'tip'
            ? row.level
            : 'tip'
        const alert: CoachAlert = {
          id: `brain-${i}-${String(row.title || 'a')}`,
          level,
          title: String(row.title || 'Подсказка'),
          text: String(row.text || ''),
          say: row.say ? String(row.say) : undefined,
        }
        return alert
      })
      .filter((a) => a.text || a.title)

    return {
      stage: String(parsed.stage || 'greeting'),
      situation: String(parsed.situation || ''),
      priorityAction: String(parsed.priorityAction || ''),
      sayNext: Array.isArray(parsed.sayNext)
        ? parsed.sayNext.map(String).filter(Boolean).slice(0, 3)
        : [],
      alerts,
      checkItems: Array.isArray(parsed.checkItems)
        ? parsed.checkItems.map(String)
        : [],
      pointB: String(parsed.pointB || ''),
      readiness: String(parsed.readiness || ''),
      curatorNote: String(parsed.curatorNote || ''),
    }
  } catch {
    return { ...emptyBrain(), rawError: 'Мозг вернул не-JSON' }
  }
}

async function askOpenAICompat(input: {
  url: string
  key: string
  model: string
  user: string
  signal?: AbortSignal
}): Promise<BrainResult> {
  const res = await fetch(input.url, {
    method: 'POST',
    signal: input.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.key}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: BRAIN_SYSTEM_PROMPT },
        { role: 'user', content: input.user },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return { ...emptyBrain(), rawError: `Brain API ${res.status}: ${errText.slice(0, 180)}` }
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) return { ...emptyBrain(), rawError: 'Пустой ответ мозга' }
  return parseBrainContent(content)
}

async function askGemini(input: {
  key: string
  model: string
  user: string
  signal?: AbortSignal
}): Promise<BrainResult> {
  const model = input.model || 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(input.key)}`
  const res = await fetch(url, {
    method: 'POST',
    signal: input.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${BRAIN_SYSTEM_PROMPT}\n\n${input.user}` }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return { ...emptyBrain(), rawError: `Gemini ${res.status}: ${errText.slice(0, 180)}` }
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) return { ...emptyBrain(), rawError: 'Пустой ответ Gemini' }
  return parseBrainContent(content)
}

export async function askBrain(input: {
  momName: string
  childName: string
  sellerName: string
  elapsedMin: number
  checkedIds: string[]
  checked?: Record<string, boolean>
  recentText: string
  fullText: string
  metrics?: DialogMetrics
  clientText?: string
  utterances?: Utterance[]
  signal?: AbortSignal
}): Promise<BrainResult> {
  const settings = loadSettings()
  const key = (settings.apiKey || settings.openaiApiKey || '').trim()
  const user = buildBrainUserPrompt(input)
  const model = settings.openaiModel

  if (!settings.brainEnabled || settings.provider === 'offline' || !key) {
    const checked =
      input.checked ||
      Object.fromEntries(input.checkedIds.map((id) => [id, true]))
    return runOfflineBrain({
      momName: input.momName,
      childName: input.childName,
      sellerName: input.sellerName,
      elapsedMin: input.elapsedMin,
      checked,
      recentText: input.recentText,
      fullText: input.fullText,
      metrics: input.metrics,
      clientText: input.clientText,
      utterances: input.utterances,
    })
  }

  if (settings.provider === 'gemini') {
    return askGemini({
      key,
      model: model || 'gemini-2.0-flash',
      user,
      signal: input.signal,
    })
  }

  if (settings.provider === 'deepseek') {
    return askOpenAICompat({
      url: 'https://api.deepseek.com/chat/completions',
      key,
      model: model || 'deepseek-chat',
      user,
      signal: input.signal,
    })
  }

  if (settings.provider === 'groq') {
    return askOpenAICompat({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key,
      model: model || 'llama-3.3-70b-versatile',
      user,
      signal: input.signal,
    })
  }

  return askOpenAICompat({
    url: 'https://api.openai.com/v1/chat/completions',
    key,
    model: model || 'gpt-4o-mini',
    user,
    signal: input.signal,
  })
}
