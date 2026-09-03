import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findItem } from '../data/checklist'
import {
  detectItemHits,
  guessStageFromText,
  scanPersonalAlerts,
  STAGE_HINTS,
  type CoachAlert,
} from '../data/playbook'
import { buildDossier, type Dossier } from '../data/dossier'
import { askBrain, type BrainResult } from '../lib/brain'
import {
  clientQuery,
  computeMetrics,
  pushUtterance,
  reviseUtterance,
  sellerQuery,
  type Channel,
  type DialogMetrics,
  type Utterance,
} from '../lib/dialogMeter'
import { LocalSttListener, type LocalSttStatus } from '../lib/localStt'
import { pickNowCards } from '../lib/nowCard'
import { SpeechListener } from '../lib/speechListener'
import { rememberSuccess } from '../store/memoryStore'
import { hasBrainKey, loadSettings } from '../store/settingsStore'
import type { Session } from '../store/sessionStore'

type Args = {
  session: Session
  enabled: boolean
  onAutoCheck: (itemIds: string[]) => void
  onSuggestStage: (stageId: string) => void
  onBrainNotes?: (notes: { pointB?: string; readiness?: string; curatorNote?: string }) => void
}

export function useLiveCoach({
  session,
  enabled,
  onAutoCheck,
  onSuggestStage,
  onBrainNotes,
}: Args) {
  const [status, setStatus] = useState<'idle' | 'listening' | 'unsupported' | 'denied'>('idle')
  const [partial, setPartial] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ruleAlerts, setRuleAlerts] = useState<CoachAlert[]>([])
  const [brain, setBrain] = useState<BrainResult | null>(null)
  const [brainBusy, setBrainBusy] = useState(false)
  const [brainStatus, setBrainStatus] = useState<'off' | 'ready' | 'thinking' | 'error'>('off')

  const [metrics, setMetrics] = useState<DialogMetrics | null>(null)
  /** последние слова мамы отдельно от своих: по ним выбирается готовый ход */
  const [clientText, setClientText] = useState('')
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [saved, setSaved] = useState<{ title: string; value: string } | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [parentStatus, setParentStatus] = useState<LocalSttStatus>('idle')
  const [parentSpeaking, setParentSpeaking] = useState(false)

  const fullRef = useRef('')
  const recentRef = useRef('')
  const utterancesRef = useRef<Utterance[]>([])
  const savedIdsRef = useRef<Set<string>>(new Set())
  const savedTimer = useRef(0)
  const shownRef = useRef({ id: '', at: 0 })
  /** что уже висело на экране: по этому напоминания уходят в конец очереди */
  const historyRef = useRef<Record<string, { at: number; times: number }>>({})
  const sessionRef = useRef(session)
  const lastBrainAt = useRef(0)
  const lastBrainText = useRef('')
  const abortRef = useRef<AbortController | null>(null)
  const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now()

  sessionRef.current = session

  const transcript = useMemo(() => lines.join(' '), [lines])

  /**
   * Карточка заполнилась сама — показываем это одной строкой на несколько
   * секунд. Пока Егор не увидел, что ответ мамы записан, он держит его в
   * голове и тянется к блокноту.
   */
  const applyDossier = useCallback((next: Dossier) => {
    const fresh = next.entries.find((e) => !savedIdsRef.current.has(e.field.id))
    savedIdsRef.current = new Set(next.entries.map((e) => e.field.id))
    setDossier(next)
    if (!fresh) return
    setSaved({ title: fresh.field.title, value: fresh.value.slice(0, 70) })
    window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSaved(null), 7000)
  }, [])

  const runBrain = useCallback(async (force = false) => {
    const settings = loadSettings()
    if (!settings.brainEnabled || !hasBrainKey(settings)) {
      setBrainStatus(hasBrainKey(settings) ? 'ready' : 'off')
      return
    }

    const recent = recentRef.current || transcript.slice(-1200)
    const full = fullRef.current || transcript
    if (!recent.trim() && !force) return

    const now = Date.now()
    // офлайн-мозг считается локально за миллисекунды, поэтому не придерживаем его
    const minGap = settings.provider === 'offline' ? 300 : 7000
    if (!force && now - lastBrainAt.current < minGap) return
    if (!force && recent === lastBrainText.current) return

    lastBrainAt.current = now
    lastBrainText.current = recent
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setBrainBusy(true)
    setBrainStatus('thinking')

    const checked = sessionRef.current.checked
    const elapsedMin = (now - startedAt) / 60000
    const result = await askBrain({
      momName: sessionRef.current.momName,
      childName: sessionRef.current.childName,
      sellerName: sessionRef.current.sellerName,
      elapsedMin,
      checkedIds: Object.entries(checked)
        .filter(([, v]) => v)
        .map(([k]) => k),
      checked,
      recentText: recent,
      fullText: full,
      metrics: computeMetrics(utterancesRef.current),
      clientText: clientQuery(utterancesRef.current),
      utterances: utterancesRef.current,
      signal: ac.signal,
    })

    if (ac.signal.aborted) return

    setBrainBusy(false)

    if (result.rawError) {
      setBrainStatus('error')
      setError(result.rawError)
      return
    }

    setBrainStatus('thinking')
    setBrain(result)
    setBrainStatus('ready')
    setError(null)

    if (result.checkItems?.length) {
      const fresh = result.checkItems.filter((id) => !checked[id])
      if (fresh.length) onAutoCheck(fresh)
    }

    if (result.stage) onSuggestStage(result.stage)

    if (onBrainNotes && (result.pointB || result.readiness || result.curatorNote)) {
      onBrainNotes({
        pointB: result.pointB || undefined,
        readiness: result.readiness || undefined,
        curatorNote: result.curatorNote || undefined,
      })
    }
  }, [onAutoCheck, onBrainNotes, onSuggestStage, startedAt, transcript])

  /**
   * Общий вход для обоих каналов речи: с микрофона говорит Егор,
   * из петли системного звука — мама или ребёнок.
   */
  const ingest = useCallback(
    (text: string, channel?: Channel, id?: string) => {
      const clean = text.trim()
      if (!clean) return

      setLines((prev) => [...prev.slice(-80), channel === 'system' ? `мама: ${clean}` : clean])
      fullRef.current = `${fullRef.current} ${clean}`.trim()
      recentRef.current = `${recentRef.current} ${clean}`.trim().slice(-1400)
      utterancesRef.current = pushUtterance(
        utterancesRef.current,
        clean,
        Date.now(),
        240,
        channel,
        id,
      )
      if (channel !== 'system') setPartial('')

      const checked = sessionRef.current.checked
      const hits = detectItemHits(fullRef.current)
      const fresh = hits.filter((id) => !checked[id])
      if (fresh.length) onAutoCheck(fresh)

      onSuggestStage(guessStageFromText(recentRef.current, checked))

      const elapsedMin = (Date.now() - startedAt) / 60000
      const live = computeMetrics(utterancesRef.current)
      setMetrics(live)
      setClientText(clientQuery(utterancesRef.current))
      applyDossier(buildDossier(utterancesRef.current))
      setRuleAlerts(
        scanPersonalAlerts({
          recentText: recentRef.current,
          fullText: fullRef.current,
          clientText: clientQuery(utterancesRef.current),
          sellerText: sellerQuery(utterancesRef.current),
          checked: { ...checked, ...Object.fromEntries(hits.map((id) => [id, true])) },
          elapsedMin,
          metrics: live,
        }).slice(0, 3),
      )

      void runBrain(false)
    },
    [applyDossier, onAutoCheck, onSuggestStage, runBrain, startedAt],
  )

  /**
   * Точная модель переслушала кусок и вернула другие слова.
   * Подсказка по ошибочному тексту уже показана, поэтому меняем текст
   * везде и сразу пересчитываем мозг — дальше он думает по верным словам.
   */
  const revise = useCallback(
    (id: string, text: string) => {
      const before = utterancesRef.current.find((u) => u.id === id)
      if (!before || before.text === text.trim()) return

      const swap = (source: string) => {
        const at = source.lastIndexOf(before.text)
        return at < 0
          ? source
          : `${source.slice(0, at)}${text.trim()}${source.slice(at + before.text.length)}`
      }

      utterancesRef.current = reviseUtterance(utterancesRef.current, id, text)
      fullRef.current = swap(fullRef.current)
      recentRef.current = swap(recentRef.current)
      setLines((prev) => prev.map((line) => (line.includes(before.text) ? swap(line) : line)))
      applyDossier(buildDossier(utterancesRef.current))
      void runBrain(true)
    },
    [applyDossier, runBrain],
  )

  // слушатели живут всю встречу, поэтому берут свежий обработчик через ref
  const ingestRef = useRef(ingest)
  ingestRef.current = ingest
  const reviseRef = useRef(revise)
  reviseRef.current = revise
  const parentOnRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setPartial('')
      abortRef.current?.abort()
      return
    }

    setBrainStatus(hasBrainKey() ? 'ready' : 'off')

    /**
     * Своя речь: локальный whisper надёжнее встроенного в Chromium —
     * тот ходит на серверы Google и из этой сети падает с «network».
     */
    if (LocalSttListener.available) {
      const mic = new LocalSttListener('mic', {
        onStatus: (s) => setStatus(s === 'listening' ? 'listening' : 'idle'),
        onError: setError,
        onFinal: (text, id) => ingestRef.current(text, 'mic', id),
        onRevision: (id, text) => reviseRef.current(id, text),
      })
      void mic.start()
      return () => {
        void mic.stop()
        void window.workar?.stt?.stop()
        abortRef.current?.abort()
      }
    }

    const listener = new SpeechListener({
      onStatus: setStatus,
      onError: setError,
      onPartial: setPartial,
      onFinal: (text) => ingestRef.current(text, parentOnRef.current ? 'mic' : undefined),
    })

    void listener.start()

    return () => {
      listener.stop()
      abortRef.current?.abort()
    }
  }, [enabled, session.id])

  useEffect(() => {
    if (!enabled || !loadSettings().listenParent) {
      setParentStatus('idle')
      return
    }

    const parent = new LocalSttListener('system', {
      onStatus: (s) => {
        setParentStatus(s)
        parentOnRef.current = s === 'listening'
      },
      onError: setError,
      onSpeech: setParentSpeaking,
      onFinal: (text, id) => ingestRef.current(text, 'system', id),
      onRevision: (id, text) => reviseRef.current(id, text),
    })

    void parent.start()

    return () => {
      parentOnRef.current = false
      void parent.stop()
      // распознаватель общий на оба канала, гасим его вместе со встречей
      void window.workar?.stt?.stop()
    }
  }, [enabled, session.id])

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      void runBrain(false)
      const elapsedMin = (Date.now() - startedAt) / 60000
      // пересчёт без новой речи — так ловится тишина и остывание клиента
      const live = computeMetrics(utterancesRef.current)
      setMetrics(live)
      setRuleAlerts(
        scanPersonalAlerts({
          recentText: recentRef.current || transcript.slice(-1200),
          fullText: fullRef.current || transcript,
          clientText: clientQuery(utterancesRef.current),
          sellerText: sellerQuery(utterancesRef.current),
          checked: session.checked,
          elapsedMin,
          metrics: live,
        }).slice(0, 3),
      )
    }, 4000)
    return () => window.clearInterval(id)
  }, [enabled, runBrain, session.checked, startedAt, transcript])

  const fallbackStage =
    STAGE_HINTS.find(
      (s) =>
        s.stageId ===
        guessStageFromText(recentRef.current || transcript, session.checked),
    ) ?? STAGE_HINTS[0]

  const brainStageHint =
    STAGE_HINTS.find((s) => s.stageId === brain?.stage) ?? fallbackStage

  const mergedAlerts = useMemo(() => {
    const fromBrain = brain?.alerts ?? []
    const ids = new Set(fromBrain.map((a) => a.title))
    const fromRules = ruleAlerts.filter((a) => !ids.has(a.title))
    return [...fromBrain, ...fromRules].slice(0, 5)
  }, [brain, ruleAlerts])

  // очередь подсказок: на экране всегда первая, остальные ждут кнопки «дальше»
  const nowQueue = useMemo(
    () =>
      pickNowCards({
        brain,
        dossier,
        stageHint: brainStageHint,
        alerts: mergedAlerts,
        clientText,
        priceNamed: Boolean(sessionRef.current.money?.total || sessionRef.current.money?.monthly),
        shown: historyRef.current,
        // пока мама держит слово, «спроси» бесполезно: он всё равно слушает
        clientHoldsFloor: Boolean(metrics && metrics.clientShare > 0.6 && metrics.utterances >= 3),
      }).filter((c) => !skipped.includes(c.id)),
    [brain, brainStageHint, clientText, dossier, mergedAlerts, metrics, skipped],
  )

  /**
   * Карточка держится на экране несколько секунд, даже если наверх пролезла
   * другая. Прочитать мигающую подсказку невозможно, а речь мамы меняет
   * расклад каждые пару секунд.
   */
  const nowCard = useMemo(() => {
    const top = nowQueue[0] ?? null
    const held = nowQueue.find((c) => c.id === shownRef.current.id)
    if (held && Date.now() - shownRef.current.at < 8000) return held
    if (top && top.id !== shownRef.current.id) {
      shownRef.current = { id: top.id, at: Date.now() }
      // отметка «это он уже видел»: напоминание не полезет второй раз подряд
      const before = historyRef.current[top.id]
      historyRef.current[top.id] = { at: Date.now(), times: (before?.times ?? 0) + 1 }
    }
    return top
  }, [nowQueue])

  return {
    status,
    partial,
    lines,
    transcript,
    error,
    alerts: mergedAlerts,
    stageHint: brainStageHint,
    metrics,
    dossier,
    saved,
    nowCard,
    nowRest: Math.max(nowQueue.length - 1, 0),
    skipCard: () => {
      if (nowCard) setSkipped((prev) => [...prev, nowCard.id])
    },
    parentStatus,
    parentSpeaking,
    brain,
    brainBusy,
    brainStatus,
    focusItem: findItem(session.activeItemId),
    markWorked: (say: string) => {
      rememberSuccess({
        trigger: clientQuery(utterancesRef.current, 2) || recentRef.current.slice(-200),
        say,
        stage: brain?.stage || brainStageHint.stageId,
      })
    },
    refreshBrain: () => void runBrain(true),
    clearError: () => setError(null),
  }
}
