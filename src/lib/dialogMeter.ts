/**
 * Механика живого диалога: кто говорит, сколько, с каким темпом.
 * Роли определяются эвристикой по лексике и длине реплики —
 * микрофон один, настоящей диаризации нет.
 */

export type Role = 'seller' | 'client' | 'kid'

export type Utterance = {
  text: string
  at: number
  chars: number
  role: Role
  hasQuestion: boolean
  /** метка куска речи: по ней точная модель присылает исправление */
  id?: string
}

export type SellingTip = 'ok' | 'ask_open_question' | 'slow_down' | 'listen'

export type DialogMetrics = {
  windowSec: number
  utterances: number
  exchanges: number
  totalExchanges: number
  sellerShare: number
  clientShare: number
  sellerQuestions: number
  sellerTempo: number
  clientTempo: number
  clientReplies: number
  clientAvgChars: number
  silenceSec: number
  lastClientText: string
  kidPresent: boolean
  clientAudible: boolean
  monologue: boolean
  clientCooling: boolean
  sellingTip: SellingTip
}

const SELLER_HINTS = [
  /меня зовут/i,
  /методист/i,
  /наш[аеийу]?\s*школ/i,
  /парта/i,
  /диагностик/i,
  /колесо баланса/i,
  /дофамин|кортизол/i,
  /рассрочк|тариф|стоимость/i,
  /куратор/i,
  /давайте (расскажу|покажу|посчитаем)/i,
  /сейчас (покажу|расскажу|включу)/i,
  /представьте/i,
  /по шкале|от 0 до 10/i,
  /правильно (ли )?понимаю/i,
  /подскажите|скажите, пожалуйста/i,
  /мы (работаем|помогаем|сотрудничаем)/i,
]

const CLIENT_HINTS = [
  /^(да|нет|угу|ага|понятно|хорошо|ладно|конечно|спасибо|ясно)(?![а-яё])/i,
  /подума|посовету|обсуж/i,
  /с мужем|с папой|с женой/i,
  /дорого|нет денег|не готов/i,
  /мой (сын|ребён|ребен)|моя дочь|у нас (сын|дочь|ребён|ребен)/i,
  /он не хочет|она не хочет|не слушается/i,
  /пришлите|скиньте|отправьте/i,
  /интересно|посмотрим/i,
  /сколько стоит|а сколько|а можно|а если мы/i,
]

const KID_HINTS = [
  /залипа/i,
  /^норм/i,
  /^не знаю/i,
  /училк|учитель ор[её]т/i,
  /скучно|(?<![а-яё])лень(?![а-яё])/i,
  /^(да|нет) я /i,
]

function scoreHints(text: string, hints: RegExp[]): number {
  let n = 0
  for (const re of hints) if (re.test(text)) n += 1
  return n
}

export function classifyRole(text: string, prevRole: Role | null): Role {
  const chars = text.length
  // вопросы на встрече задаёт в основном продавец
  const seller =
    scoreHints(text, SELLER_HINTS) * 2 + (chars > 220 ? 2 : 0) + (/\?\s*$/.test(text) ? 1 : 0)
  const client = scoreHints(text, CLIENT_HINTS) * 2 + (chars < 45 ? 1 : 0)
  const kid = scoreHints(text, KID_HINTS) * 2

  if (kid > seller && kid >= client && chars < 160) return 'kid'
  if (seller > client) return 'seller'
  if (client > seller) return 'client'
  // ничья: короткая реплика после речи продавца — почти всегда клиент
  if (chars < 90) return prevRole === 'seller' ? 'client' : 'seller'
  return 'seller'
}

/**
 * Канал записи важнее эвристик: с микрофона всегда говорит Егор,
 * из петли системного звука — всегда та сторона (мама или ребёнок).
 */
export type Channel = 'mic' | 'system'

function roleFor(text: string, prevRole: Role | null, channel?: Channel): Role {
  if (channel === 'mic') return 'seller'
  const guess = classifyRole(text, prevRole)
  if (channel === 'system') return guess === 'seller' ? 'client' : guess
  return guess
}

const isQuestion = (text: string) =>
  /[?]/.test(text) || /^(скажите|подскажите|а как|что именно|почему)/i.test(text)

export function pushUtterance(
  list: Utterance[],
  text: string,
  at = Date.now(),
  limit = 240,
  channel?: Channel,
  id?: string,
): Utterance[] {
  const clean = text.trim()
  if (!clean) return list
  const prevRole = list.length ? list[list.length - 1].role : null
  const item: Utterance = {
    text: clean,
    at,
    chars: clean.length,
    role: roleFor(clean, prevRole, channel),
    hasQuestion: isQuestion(clean),
    id,
  }
  const next = [...list, item]
  return next.length > limit ? next.slice(next.length - limit) : next
}

/**
 * Точная модель переслушала кусок и вернула другие слова.
 * Роль не пересчитываем: канал записи её уже определил и он не меняется.
 */
export function reviseUtterance(list: Utterance[], id: string, text: string): Utterance[] {
  const clean = text.trim()
  if (!clean) return list
  const i = list.findIndex((u) => u.id === id)
  if (i < 0) return list
  const next = [...list]
  next[i] = { ...list[i], text: clean, chars: clean.length, hasQuestion: isQuestion(clean) }
  return next
}

function countExchanges(list: Utterance[]): number {
  let n = 0
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1].role === 'seller' ? 'seller' : 'client'
    const b = list[i].role === 'seller' ? 'seller' : 'client'
    if (a !== b) n += 1
  }
  return n
}

export function computeMetrics(
  list: Utterance[],
  now = Date.now(),
  windowSec = 90,
): DialogMetrics {
  const from = now - windowSec * 1000
  const win = list.filter((u) => u.at >= from)
  const sellerWin = win.filter((u) => u.role === 'seller')
  const clientWin = win.filter((u) => u.role !== 'seller')

  const sellerChars = sellerWin.reduce((s, u) => s + u.chars, 0)
  const clientChars = clientWin.reduce((s, u) => s + u.chars, 0)
  const totalChars = sellerChars + clientChars

  const spanSec = win.length
    ? Math.max(15, (now - Math.min(...win.map((u) => u.at))) / 1000)
    : windowSec

  const lastClient = [...list].reverse().find((u) => u.role !== 'seller')
  const silenceSec = lastClient ? (now - lastClient.at) / 1000 : 0

  const clientAvgChars = clientWin.length ? Math.round(clientChars / clientWin.length) : 0
  const sellerShare = totalChars ? sellerChars / totalChars : 0
  const clientShare = totalChars ? clientChars / totalChars : 0
  const sellerQuestions = sellerWin.filter((u) => u.hasQuestion).length

  /**
   * Микрофон может вообще не слышать клиента (звук идёт в наушники Егора).
   * Тогда доля речи и «монолог» бессмысленны — метрики поведения отключаем.
   */
  const clientCharsTotal = list
    .filter((u) => u.role !== 'seller')
    .reduce((s, u) => s + u.chars, 0)
  const clientAudible = clientCharsTotal >= 60

  const monologue =
    clientAudible && totalChars >= 400 && sellerShare >= 0.7 && sellerQuestions === 0

  const coolingWords = lastClient
    ? /^(да|угу|ага|понятно|ясно|хорошо|интересно|посмотрим)/i.test(lastClient.text) ||
      /пришлите|скиньте|подума/i.test(lastClient.text)
    : false
  const clientCooling =
    clientAudible &&
    clientWin.length >= 3 &&
    clientAvgChars <= 32 &&
    (coolingWords || silenceSec > 25)

  let sellingTip: SellingTip = 'ok'
  if (monologue || (clientAudible && silenceSec > 60)) sellingTip = 'ask_open_question'
  else if (clientCooling) sellingTip = 'ask_open_question'
  else if (sellerChars / spanSec > 17) sellingTip = 'slow_down'
  else if (clientShare > 0.65 && win.length >= 4) sellingTip = 'listen'

  return {
    windowSec,
    utterances: win.length,
    exchanges: countExchanges(win),
    totalExchanges: countExchanges(list),
    sellerShare,
    clientShare,
    sellerQuestions,
    sellerTempo: Math.round((sellerChars / spanSec) * 10) / 10,
    clientTempo: Math.round((clientChars / spanSec) * 10) / 10,
    clientReplies: clientWin.length,
    clientAvgChars,
    silenceSec: Math.round(silenceSec),
    lastClientText: lastClient?.text ?? '',
    kidPresent: list.some((u) => u.role === 'kid'),
    clientAudible,
    monologue,
    clientCooling,
    sellingTip,
  }
}

export const SELLING_TIP_LABEL: Record<SellingTip, string> = {
  ok: 'ритм ок',
  ask_open_question: 'задай открытый вопрос',
  slow_down: 'сбавь темп',
  listen: 'слушай, не перебивай',
}

/** Текст только реплик клиента — чистый запрос для ретривера */
export function clientQuery(list: Utterance[], take = 3): string {
  return [...list]
    .reverse()
    .filter((u) => u.role !== 'seller')
    .slice(0, take)
    .reverse()
    .map((u) => u.text)
    .join(' ')
}

/**
 * Текст только своих реплик.
 *
 * Половина правил ловит ошибки Егора — цену без точки Б, давление дедлайном,
 * спор с мамой. Если кормить их общим текстом, правило срабатывает на слова
 * самой мамы и наоборот; поэтому каждый сигнал слушает своего говорящего.
 */
export function sellerQuery(list: Utterance[], take = 4): string {
  return [...list]
    .reverse()
    .filter((u) => u.role === 'seller')
    .slice(0, take)
    .reverse()
    .map((u) => u.text)
    .join(' ')
}
