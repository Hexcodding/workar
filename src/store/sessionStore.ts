import { allItemIds, CHECKLIST } from '../data/checklist'

const HISTORY_KEY = 'workar.history.v1'
const PROFILE_KEY = 'workar.profile.v1'
const ACTIVE_KEY = 'workar.active.v1'

export type CuratorNotes = {
  pains: string
  pointB: string
  readiness: string
  objections: string
  agreement: string
  nextStep: string
  freeNotes: string
  /** чем кончился звонок: продажа, думает, отказ */
  result: string
  /** сумма, если оформили */
  amount: string
}

/**
 * Снимок карточки в сессии.
 *
 * Живая карточка считается по репликам и умирает вместе со встречей, а строка
 * для таблицы нужна и через неделю из истории — поэтому то, что нашлось,
 * оседает прямо в сессии.
 */
export type CardEntry = {
  id: string
  title: string
  value: string
  quote: string
  role: string
  at: number
  source: string
}

export type Session = {
  id: string
  createdAt: string
  updatedAt: string
  momName: string
  childName: string
  sellerName: string
  startedAt: string | null
  endedAt: string | null
  checked: Record<string, boolean>
  activeItemId: string
  notes: CuratorNotes
  card?: CardEntry[]
  /** что в отчёт вписала сама программа: по этому снимку видно, где правка Егора */
  autoNotes?: Record<string, string>
  /** цифры сделки, названные вслух: в карточку они не попадают, а в таблицу нужны */
  money?: { total: string; monthly: string }
}

export type SellerProfile = {
  sellerName: string
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyNotes(): CuratorNotes {
  return {
    pains: '',
    pointB: '',
    readiness: '',
    objections: '',
    agreement: '',
    nextStep: '',
    freeNotes: '',
    result: '',
    amount: '',
  }
}

/** Встречи, записанные до появления новых полей, читаются как есть */
function withDefaults(session: Session): Session {
  return {
    ...session,
    notes: { ...emptyNotes(), ...session.notes },
    card: session.card ?? [],
    autoNotes: session.autoNotes ?? {},
  }
}

export function createSession(input: {
  momName: string
  childName: string
  sellerName: string
}): Session {
  const firstId = CHECKLIST[0]?.items[0]?.id ?? ''
  const now = new Date().toISOString()
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    momName: input.momName.trim(),
    childName: input.childName.trim(),
    sellerName: input.sellerName.trim(),
    startedAt: now,
    endedAt: null,
    checked: Object.fromEntries(allItemIds().map((id) => [id, false])),
    activeItemId: firstId,
    notes: emptyNotes(),
  }
}

export function loadProfile(): SellerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return { sellerName: '' }
    return JSON.parse(raw) as SellerProfile
  } catch {
    return { sellerName: '' }
  }
}

export function saveProfile(profile: SellerProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function loadActiveSession(): Session | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (!raw) return null
    return withDefaults(JSON.parse(raw) as Session)
  } catch {
    return null
  }
}

export function saveActiveSession(session: Session | null) {
  if (!session) {
    localStorage.removeItem(ACTIVE_KEY)
    return
  }
  const next = { ...session, updatedAt: new Date().toISOString() }
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(next))
}

export function loadHistory(): Session[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as Session[]).map(withDefaults)
  } catch {
    return []
  }
}

export function saveHistory(list: Session[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
}

export function upsertHistory(session: Session) {
  const list = loadHistory().filter((s) => s.id !== session.id)
  list.unshift({ ...session, updatedAt: new Date().toISOString() })
  saveHistory(list.slice(0, 50))
}

export function stageProgress(session: Session, stageId: string): {
  done: number
  total: number
} {
  const stage = CHECKLIST.find((s) => s.id === stageId)
  if (!stage) return { done: 0, total: 0 }
  const total = stage.items.length
  const done = stage.items.filter((item) => session.checked[item.id]).length
  return { done, total }
}

export function overallProgress(session: Session): { done: number; total: number } {
  const ids = allItemIds()
  const done = ids.filter((id) => session.checked[id]).length
  return { done, total: ids.length }
}

/**
 * Сообщение куратору.
 *
 * Уходит в чат, поэтому пустые блоки не печатаем совсем: прочерки только
 * растягивают текст и заставляют читающего искать в нём смысл. Прогресс
 * чек-листа куратору тоже не нужен — это внутренняя кухня звонка.
 */
export function buildSummary(session: Session): string {
  const n = session.notes
  const who = [session.childName, byId(session, 'grade')?.value].filter(Boolean).join(', ')
  const head = [
    `Диагностика ${new Date(session.startedAt ?? session.createdAt).toLocaleDateString('ru-RU')}`,
    who || null,
    session.momName ? `мама ${session.momName}` : null,
  ]
    .filter(Boolean)
    .join(' — ')

  const money = n.amount || session.money?.total || ''
  const monthly = session.money?.monthly ? `, ${session.money.monthly} в месяц` : ''
  const result = [n.result, money && `${money}${monthly}`].filter(Boolean).join(', ')

  const blocks: Array<[string, string]> = [
    ['Итог', result],
    ['Боли', n.pains],
    ['Хочет', n.pointB],
    ['Готовность', n.readiness && `${n.readiness} из 10`],
    ['Что мешает', n.objections],
    ['Договорились', n.agreement],
    ['Дожимать', n.nextStep],
    ['Ещё', n.freeNotes],
  ]

  const body = blocks
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([title, value]) =>
      value.includes('\n') ? `${title}:\n${bullets(value)}` : `${title}: ${value.trim()}`,
    )

  return [head, '', ...body].join('\n')
}

function byId(session: Session, id: string): CardEntry | undefined {
  return session.card?.find((e) => e.id === id)
}

/** Многострочное поле читается списком, сплошным абзацем — нет */
function bullets(value: string): string {
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `— ${s}`)
    .join('\n')
}
