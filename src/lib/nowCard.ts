/**
 * Что делать прямо сейчас — одной карточкой.
 *
 * В разговоре Егор смотрит на экран секунду, и за эту секунду читается одна
 * строка, а не восемь блоков. Поэтому всё, что знает мозг, здесь сводится к
 * очереди: наверху то, что случилось только что в словах мамы, ниже — то, что
 * пора спросить. Показываем первую карточку, остальные ждут кнопки «дальше».
 */
import type { Dossier } from '../data/dossier'
import type { MomPain, PointBCard, VpQuestion } from '../data/mentorPack'
import type { CoachAlert, StageHint } from '../data/playbook'
import { pickSay, type SayMove } from '../data/sayBank'
import type { BrainResult } from './brain'

export type NowCardKind = 'answer' | 'push' | 'ask' | 'lead'

export type NowCard = {
  /** чтобы «дальше» не показывал одно и то же дважды */
  id: string
  kind: NowCardKind
  /** что это за карточка: одно слово, читается боковым зрением */
  label: string
  /** главное действие, крупно */
  headline: string
  /** дословная фраза, которую можно сказать как есть */
  say?: string
  /** откуда это взялось: слова мамы или пробел в карточке */
  because?: string
}

const LABEL: Record<NowCardKind, string> = {
  answer: 'ответь',
  push: 'надави',
  ask: 'спроси',
  lead: 'веди',
}

function card(kind: NowCardKind, id: string, headline: string, say?: string, because?: string): NowCard {
  return { id, kind, label: LABEL[kind], headline, say, because }
}

/**
 * Чем сигнал является по сути.
 *
 * Уровень «критично» тут не помогает: и «мама сказала дорого», и «отстаёшь
 * от эталона» приходят критичными, а делать по ним надо разное — на одно
 * отвечать, на другое просто вести дальше. Различаем по имени сигнала: их
 * выдаёт наш же мозг, имена стабильные.
 */
const KIND_BY_ID: Array<[RegExp, NowCardKind]> = [
  [/^kb-objection|^slip-risk|^think|^argue|^client-cooling/, 'answer'],
  [/^mentor-pain|^mentor-detached/, 'push'],
  [/^gate-|^mentor-scale|^mentor-subject|^pointb|^scale|^price-no-b|^preclose|^lpr|^no-questions/, 'ask'],
  [/^timeline|^slip-watch|^mentor-line|^monologue|^pitch-long|^crm|^client-silent/, 'lead'],
]

function alertKind(alert: CoachAlert): NowCardKind {
  const known = KIND_BY_ID.find(([re]) => re.test(alert.id))
  if (known) return known[1]
  return alert.level === 'critical' ? 'answer' : 'lead'
}

function fromAlert(alert: CoachAlert): NowCard {
  return card(alertKind(alert), `alert:${alert.id}`, alert.title, alert.say, alert.text)
}

/**
 * Боль за словами мамы. Отвечать на неё нельзя — от готового ответа мама
 * закрывается; можно только углубить, чтобы она сама договорила.
 */
function fromPain(pain: MomPain): NowCard {
  return card(
    'push',
    `pain:${pain.id}`,
    pain.pain,
    pain.deepen[0],
    pain.deeper ?? `прозвучало: ${pain.surface}`,
  )
}

function fromPointB(pointB: PointBCard): NowCard | null {
  const slot = pointB.next
  if (!slot) return null
  return card('ask', `pointb:${slot.id}`, `Точка Б: ${slot.title}`, slot.ask, `оцифровано ${pointB.done} из ${pointB.total}`)
}

function fromVp(vp: VpQuestion): NowCard {
  return card(
    'ask',
    `vp:${vp.order}`,
    vp.audience === 'kid' ? `Вопрос ребёнку · ${vp.order}` : `Вопрос ${vp.order}`,
    vp.text,
  )
}

/** Пустые поля карточки: спрашиваем то, что мама ещё не сказала */
function fromDossier(dossier: Dossier): NowCard[] {
  return dossier.missing
    .filter((field) => field.ask)
    .slice(0, 3)
    .map((field) => card('ask', `field:${field.id}`, `Не записано: ${field.title}`, field.ask))
}

function fromSay(move: SayMove): NowCard {
  const say = move.then ? `${move.say}\n${move.then}` : move.say
  return card('answer', `say:${move.id}`, move.title, say, move.because)
}

/** Сколько молчит напоминание, которое Егор уже видел и не выполнил */
const QUIET_MS = 4 * 60 * 1000
/** Боль — реакция, но одна и та же боль подряд превращается в фон */
const PAIN_QUIET_MS = 2 * 60 * 1000

export function pickNowCards(input: {
  brain: BrainResult | null
  dossier: Dossier | null
  stageHint: StageHint
  alerts: CoachAlert[]
  /** последние слова мамы: по ним выбирается готовый ход */
  clientText?: string
  priceNamed?: boolean
  /** когда карточка висела на экране и сколько раз он её уже видел */
  shown?: Record<string, { at: number; times: number }>
  now?: number
  /** мама сейчас говорит: спрашивать нечего, надо слушать и отвечать */
  clientHoldsFloor?: boolean
}): NowCard[] {
  const { brain, dossier, stageHint, alerts, clientText, priceNamed } = input
  const out: NowCard[] = []
  const move = pickSay(clientText ?? '', { priceNamed })

  /*
   * Боль мама уже показывает отдельной карточкой, дважды не надо.
   * Готовый ход вытесняет ответ из корпуса: там абзац чужой стенограммы,
   * а здесь фраза, которую можно произнести с экрана.
   */
  const signals = alerts
    .filter((a) => !a.id.startsWith('mentor-pain'))
    .filter((a) => !(move && a.id.startsWith('kb-objection')))
    .map(fromAlert)

  if (move) out.push(fromSay(move))
  out.push(...signals.filter((c) => c.kind === 'answer'))
  if (brain?.momPain) out.push(fromPain(brain.momPain))
  out.push(...signals.filter((c) => c.kind === 'push'))
  out.push(...signals.filter((c) => c.kind === 'ask'))

  if (brain?.pointBCard) {
    const next = fromPointB(brain.pointBCard)
    if (next) out.push(next)
  }
  if (brain?.vpNext) out.push(fromVp(brain.vpNext))
  if (dossier) out.push(...fromDossier(dossier))
  out.push(...signals.filter((c) => c.kind === 'lead'))

  if (brain?.priorityAction) {
    out.push(card('lead', `brain:${brain.stage}`, brain.priorityAction, brain.sayNext[0], brain.situation))
  }
  out.push(card('lead', `stage:${stageHint.stageId}`, stageHint.focus, stageHint.sayNow[0], stageHint.title))

  const seen = new Set<string>()
  const unique = out.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)))

  /*
   * Напоминание — не реакция. Пока мама рассказывает про боль, «спроси точку Б»
   * может провисеть весь блок и вытеснить всё живое: на прошлом звонке одна
   * такая карточка держала экран сто реплик подряд. Поэтому то, что Егор уже
   * видел и не сделал, уходит вниз очереди и ждёт своей паузы. Ответы на слова
   * мамы не приглушаем никогда: если она повторила возражение, отвечать надо
   * снова.
   */
  const shown = input.shown ?? {}
  const now = input.now ?? Date.now()
  const quiet = (c: NowCard) => {
    if (c.kind === 'answer') return false
    const last = shown[c.id]
    if (c.kind === 'push') return Boolean(last && now - last.at < PAIN_QUIET_MS)
    if (input.clientHoldsFloor) return true
    if (!last) return false
    // не сделал после третьего показа — значит и не собирается; отходим дальше,
    // иначе одно напоминание съедает экран на весь блок разговора
    return now - last.at < QUIET_MS * Math.min(last.times, 4)
  }

  const live = unique.filter((c) => !quiet(c))
  const waiting = unique.filter(quiet)
  return [...live, ...waiting]
}
