/**
 * Эхо клиента: дословные цитаты мамы и деньги, которые она уже тратит.
 * На цене продаёт не твоя формулировка, а её собственные слова, сказанные назад.
 */

import type { Utterance } from './dialogMeter'

export type MoneyRadar = {
  monthly: number
  mentioned: number[]
  years: number
  spentTotal: number
  argument: string
}

export type ClientEcho = {
  painQuotes: string[]
  pointBQuotes: string[]
  childFacts: string[]
  money: MoneyRadar | null
  bestPain: string
  bestPointB: string
}

/**
 * Границы слова через lookaround: \b с кириллицей не работает,
 * а без границ «помаленьку» матчится на «лень».
 */
const PAIN_CUES = new RegExp(
  [
    'не хочет',
    'не может',
    'не получается',
    'беспоко',
    'переживаю',
    'боюсь',
    '(?<![а-яё])устал',
    'скандал',
    '(?<![а-яё])ссор',
    '(?<![а-яё])кричу',
    '(?<![а-яё])двойк',
    '(?<![а-яё])тройк',
    'съезжает',
    'заставля',
    'телефон',
    'не понимает',
    'забыва',
    'не помнит',
    'прокрастин',
    '(?<![а-яё])лень(?![а-яё])',
    'ленив',
    'мотивац',
  ].join('|'),
  'i',
)

const POINT_B_CUES =
  /хочу чтобы|хотелось бы|мечта|главное чтобы|важно чтобы|нужно чтобы|чтобы (он|она|ребенок|ребёнок)|планиру|поступ|сдал|вырос/i

const CHILD_FACT_CUES =
  /класс|лет|занимается|секци|музыкальн|спорт|репетитор|школ|гимнази|переш[её]л|перешла/i

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/^[—\-,.:;]+/, '').trim()
}

function shortQuote(text: string, max = 120): string {
  const c = clean(text)
  return c.length > max ? `${c.slice(0, max - 1).trimEnd()}…` : c
}

/**
 * STT нередко склеивает несколько коротких реплик в один финал.
 * Цитировать нужно то предложение, где реально есть смысл.
 */
function bestSentence(text: string, cue: RegExp): string | null {
  const parts = clean(text)
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 5 && cue.test(s))
  if (!parts.length) return null
  return parts.sort((a, b) => b.length - a.length)[0]
}

/** Суммы вида «5 тысяч», «5000 рублей», «полторы тысячи» в речи клиента */
function parseAmounts(text: string): number[] {
  const out: number[] = []
  const t = text.toLowerCase().replace(/\u00a0/g, ' ')

  for (const m of t.matchAll(/(\d{1,3})\s*(?:тыс|тысяч|т\.р|к(?![а-яё]))/g)) {
    const n = Number(m[1])
    if (n >= 1 && n <= 500) out.push(n * 1000)
  }
  for (const m of t.matchAll(/(\d{4,6})\s*(?:руб|₽|р(?![а-яё]))/g)) {
    const n = Number(m[1])
    if (n >= 1000 && n <= 500000) out.push(n)
  }
  return out
}

function moneyArgument(monthly: number, years: number, spentTotal: number): string {
  const fmt = (n: number) => n.toLocaleString('ru-RU')
  if (years >= 1) {
    return `Вы говорили про ${fmt(monthly)} ₽ в месяц — за ${years === 1 ? 'год' : `${years} года`} это уже около ${fmt(spentTotal)} ₽. Вопрос не в том, платить или нет, а в том, за что именно платить дальше.`
  }
  return `Вы платите ${fmt(monthly)} ₽ в месяц — это ${fmt(monthly * 12)} ₽ в год. Давайте сравним, что вы получаете за эти деньги сейчас и что получите у нас.`
}

export function buildClientEcho(utterances: Utterance[]): ClientEcho {
  const clientLines = utterances.filter((u) => u.role !== 'seller')

  const painQuotes: string[] = []
  const pointBQuotes: string[] = []
  const childFacts: string[] = []
  const amounts: number[] = []

  let years = 0

  for (const u of clientLines) {
    const text = clean(u.text)
    // короткие «да, беспокоит» цитировать бессмысленно — нужна фраза со смыслом
    if (text.length < 25 || text.split(' ').length < 4) continue

    const pain = painQuotes.length < 5 ? bestSentence(text, PAIN_CUES) : null
    if (pain) painQuotes.push(shortQuote(pain))

    const pointB = pointBQuotes.length < 5 ? bestSentence(text, POINT_B_CUES) : null
    if (pointB) pointBQuotes.push(shortQuote(pointB))

    const fact = childFacts.length < 5 ? bestSentence(text, CHILD_FACT_CUES) : null
    if (fact) childFacts.push(shortQuote(fact, 90))

    const spendContext =
      /репетитор|курс|платим|плачу|стоил|стоит|отда[её]м|уходит|обходит|в месяц|за занятие|за час|тренировк|секци/i.test(
        text,
      )
    // цифры из презентации тарифа — не расходы мамы, даже если роль угадана неверно
    const productPitch = /тариф|премиум|бонус|скидк|в подарок|наше обучение|за все обучение/i.test(
      text,
    )
    if (spendContext && !productPitch) {
      amounts.push(...parseAmounts(text).filter((n) => n <= 60000))
    }

    const y = text.match(/(\d)\s*(?:год[ао]?|лет)\s*(?:уже|занима|ходим|платим)/i)
    if (y) years = Math.max(years, Number(y[1]))
    if (/уже (второй|два) год/i.test(text)) years = Math.max(years, 2)
    if (/уже (третий|три) год/i.test(text)) years = Math.max(years, 3)
  }

  const monthly = amounts.length ? Math.max(...amounts) : 0
  const money: MoneyRadar | null = monthly
    ? {
        monthly,
        mentioned: [...new Set(amounts)].sort((a, b) => b - a).slice(0, 4),
        years,
        spentTotal: monthly * 12 * (years || 1),
        argument: moneyArgument(monthly, years, monthly * 12 * (years || 1)),
      }
    : null

  return {
    painQuotes,
    pointBQuotes,
    childFacts,
    money,
    bestPain: painQuotes[painQuotes.length - 1] || '',
    bestPointB: pointBQuotes[pointBQuotes.length - 1] || '',
  }
}

/** Подставляет живые цитаты вместо placeholder-ов из базы знаний */
export function applyEcho(text: string, echo: ClientEcho, mom: string, child: string): string {
  const pain = echo.bestPain || 'то, что вы описали'
  const pointB = echo.bestPointB || 'ваш желаемый результат'

  return text
    .replaceAll('{{mom}}', mom)
    .replaceAll('[Имя]', mom)
    .replaceAll('[имя]', mom)
    .replaceAll('[имя ребёнка]', child)
    .replaceAll('[ребёнок]', child)
    .replaceAll('[ребёнка]', child)
    .replaceAll('[боль]', pain)
    .replaceAll('[её слова]', pain)
    .replaceAll('[точка Б]', pointB)
    .replaceAll('[мечта]', pointB)
    .replaceAll('[X]', echo.money ? echo.money.monthly.toLocaleString('ru-RU') : '[X]')
    .replaceAll('[Y]', echo.money ? echo.money.spentTotal.toLocaleString('ru-RU') : '[Y]')
}
