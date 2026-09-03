import { useCallback, useEffect, useRef, useState } from 'react'
import { CHECKLIST, findItem } from '../data/checklist'
import { useLiveCoach } from '../hooks/useLiveCoach'
import { applyAuto, autoNotes } from '../lib/autoNotes'
import { copyText } from '../lib/copy'
import { dealMoney } from '../lib/dealMoney'
import type { CuratorNotes, Session } from '../store/sessionStore'
import { BrainSettings } from './BrainSettings'
import { CallStrip } from './CallStrip'
import { CheatSheet } from './CheatSheet'
import { ChecklistPanel } from './ChecklistPanel'
import { ClientCard } from './ClientCard'
import { CuratorNotesPanel } from './CuratorNotes'
import { DebriefPanel } from './DebriefPanel'
import { DossierPanel } from './DossierPanel'
import { ListenBar } from './ListenBar'
import { NowCardPanel } from './NowCard'
import { ReportRowPanel } from './ReportRow'
import { SessionTimer } from './SessionTimer'
import { StageNav } from './StageNav'
import { SummaryExport } from './SummaryExport'
import { TrainingPath } from './TrainingPath'
import { Transcript } from './Transcript'

type Props = {
  session: Session
  history: Session[]
  onSessionChange: (updater: (prev: Session) => Session) => void
  onCollapse: () => void
  onFinish: () => void
  onCopied: (msg: string) => void
}

type CallTab = 'call' | 'card' | 'script' | 'report'

const TABS: Array<{ id: CallTab; title: string }> = [
  { id: 'call', title: 'Звонок' },
  { id: 'card', title: 'Карточка' },
  { id: 'script', title: 'Скрипт' },
  { id: 'report', title: 'Отчёт' },
]

export function CallWorkspace({
  session,
  history,
  onSessionChange,
  onCollapse,
  onFinish,
  onCopied,
}: Props) {
  const [tab, setTab] = useState<CallTab>('call')
  const [listening, setListening] = useState(false)
  const [showBrainSettings, setShowBrainSettings] = useState(false)
  const [activeStageId, setActiveStageId] = useState(() => {
    return findItem(session.activeItemId)?.stage.id ?? CHECKLIST[0].id
  })

  const onAutoCheck = useCallback(
    (itemIds: string[]) => {
      onSessionChange((prev) => {
        const checked = { ...prev.checked }
        for (const id of itemIds) checked[id] = true
        const last = itemIds[itemIds.length - 1]
        return {
          ...prev,
          checked,
          activeItemId: last || prev.activeItemId,
        }
      })
      const last = itemIds[itemIds.length - 1]
      const found = last ? findItem(last) : null
      if (found) setActiveStageId(found.stage.id)
    },
    [onSessionChange],
  )

  const onSuggestStage = useCallback((stageId: string) => {
    setActiveStageId((prev) => (prev === stageId ? prev : stageId))
  }, [])

  /**
   * Точку Б и готовность теперь держит карточка: там они с цитатой мамы.
   * Мозгу оставили только заметку на полях, иначе два источника перетирают
   * друг друга и автозаполнение решает, что поле правил Егор.
   */
  const onBrainNotes = useCallback(
    (notes: { curatorNote?: string }) => {
      onSessionChange((prev) => ({
        ...prev,
        notes: {
          ...prev.notes,
          freeNotes: notes.curatorNote
            ? prev.notes.freeNotes.includes(notes.curatorNote)
              ? prev.notes.freeNotes
              : `${prev.notes.freeNotes}${prev.notes.freeNotes ? '\n' : ''}${notes.curatorNote}`
            : prev.notes.freeNotes,
        },
      }))
    },
    [onSessionChange],
  )

  const coach = useLiveCoach({
    session,
    enabled: listening,
    onAutoCheck,
    onSuggestStage,
    onBrainNotes,
  })

  /**
   * Живая карточка живёт в слушалке и умирает вместе со встречей, а строка для
   * таблицы нужна и через неделю из истории — поэтому найденное складываем
   * в саму сессию.
   */
  const changeRef = useRef(onSessionChange)
  changeRef.current = onSessionChange
  const talkRef = useRef('')
  talkRef.current = coach.transcript

  useEffect(() => {
    const entries = coach.dossier?.entries ?? []
    if (!entries.length) return
    const snapshot = entries.map((e) => ({
      id: e.field.id,
      title: e.field.title,
      value: e.value,
      quote: e.quote,
      role: e.role,
      at: e.at,
      source: e.source,
    }))
    const auto = autoNotes(coach.dossier)
    const money = dealMoney(talkRef.current)
    changeRef.current((prev) => {
      const card = JSON.stringify(prev.card) === JSON.stringify(snapshot) ? prev.card : snapshot
      const filled = applyAuto(prev.notes, auto, prev.autoNotes ?? {})
      const priced =
        prev.money?.total === money.total && prev.money?.monthly === money.monthly ? prev.money : money
      if (card === prev.card && !filled && priced === prev.money) return prev
      return {
        ...prev,
        card,
        money: priced,
        notes: filled?.notes ?? prev.notes,
        autoNotes: filled?.auto ?? prev.autoNotes,
      }
    })
  }, [coach.dossier])

  const activeStage = CHECKLIST.find((s) => s.id === activeStageId) ?? CHECKLIST[0]

  function focusItem(itemId: string) {
    const found = findItem(itemId)
    if (!found) return
    setActiveStageId(found.stage.id)
    onSessionChange((prev) => ({ ...prev, activeItemId: itemId }))
  }

  function toggleItem(itemId: string) {
    onSessionChange((prev) => ({
      ...prev,
      checked: { ...prev.checked, [itemId]: !prev.checked[itemId] },
      activeItemId: itemId,
    }))
    const found = findItem(itemId)
    if (found) setActiveStageId(found.stage.id)
  }

  function selectStage(stageId: string) {
    setActiveStageId(stageId)
    const stage = CHECKLIST.find((s) => s.id === stageId)
    if (!stage) return
    const unchecked = stage.items.find((item) => !session.checked[item.id])
    const target = unchecked ?? stage.items[0]
    if (target) {
      onSessionChange((prev) => ({ ...prev, activeItemId: target.id }))
    }
  }

  function changeNotes(notes: CuratorNotes) {
    onSessionChange((prev) => ({ ...prev, notes }))
  }

  return (
    <>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>

      {/* в разговоре на экране только одно действие: читать больше некогда */}
      {tab === 'call' ? (
        <>
          <CallStrip
            stageTitle={coach.stageHint.title}
            metrics={coach.metrics}
            brain={coach.brain}
            dossier={coach.dossier}
            saved={coach.saved}
          />
          <NowCardPanel
            card={coach.nowCard}
            rest={coach.nowRest}
            onNext={coach.skipCard}
            onWorked={coach.markWorked}
          />
          <ListenBar
            listening={listening}
            onToggle={() => setListening((v) => !v)}
            status={coach.status}
            parentStatus={coach.parentStatus}
            parentSpeaking={coach.parentSpeaking}
            brainStatus={coach.brainStatus}
            brainBusy={coach.brainBusy}
            error={coach.error}
            onOpenSettings={() => setShowBrainSettings((v) => !v)}
          />
          {showBrainSettings ? <BrainSettings compact /> : null}
          <button type="button" className="btn btn-ghost btn-block" onClick={onCollapse}>
            Свернуть в меню
          </button>
        </>
      ) : null}

      {tab === 'card' ? (
        <>
          <SessionTimer startedAt={session.startedAt} painsHint={activeStageId === 'pains'} />
          <ClientCard session={session} />
          <DossierPanel
            dossier={coach.dossier}
            onCopy={(text) => {
              void copyText(text).then((ok) =>
                onCopied(ok ? 'Карточка скопирована' : 'Не удалось скопировать'),
              )
            }}
          />
          <Transcript lines={coach.lines} partial={coach.partial} />
        </>
      ) : null}

      {tab === 'script' ? (
        <>
          <StageNav
            session={session}
            activeStageId={activeStageId}
            onSelect={selectStage}
          />
          <CheatSheet session={session} />
          <ChecklistPanel
            stage={activeStage}
            session={session}
            onFocus={focusItem}
            onToggle={toggleItem}
          />
          <TrainingPath session={session} />
        </>
      ) : null}

      {tab === 'report' ? (
        <>
          <ReportRowPanel session={session} onChange={changeNotes} onCopied={onCopied} />
          <CuratorNotesPanel session={session} onChange={changeNotes} />
          <DebriefPanel session={session} history={history} />
          <SummaryExport session={session} onCopied={onCopied} />
          <button type="button" className="btn btn-ghost btn-block" onClick={onFinish}>
            Завершить и в историю
          </button>
        </>
      ) : null}
    </>
  )
}
