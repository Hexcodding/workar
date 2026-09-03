/** Лёгкая нормализация русского текста для офлайн-поиска: без словарей и моделей. */

const STOPWORDS = new Set([
  'этот', 'этого', 'этом', 'вот', 'так', 'там', 'тут', 'как', 'что', 'чтобы',
  'если', 'или', 'либо', 'тоже', 'также', 'ещё', 'еще', 'уже', 'быть', 'была',
  'было', 'были', 'есть', 'может', 'можно', 'нужно', 'надо', 'просто', 'очень',
  'вообще', 'потому', 'когда', 'который', 'которая', 'которые', 'него', 'неё',
  'нее', 'они', 'она', 'оно', 'мы', 'вы', 'ты', 'вас', 'нас', 'вам', 'нам',
  'меня', 'тебя', 'себя', 'свой', 'своя', 'свои', 'наш', 'ваш', 'для', 'при',
  'про', 'над', 'под', 'без', 'из-за', 'из', 'до', 'после', 'том', 'этих',
  'вроде', 'типа', 'такой', 'такая', 'такие', 'сейчас', 'здесь', 'потом',
  'ну', 'да', 'нет', 'ага', 'угу', 'ладно', 'хорошо', 'спасибо', 'пожалуйста',
])

const SUFFIXES = [
  'ившись', 'ывшись', 'ующий', 'ающий', 'явшись',
  'ением', 'ениям', 'ениях', 'ениями', 'остью', 'ости',
  'ание', 'ения', 'ению', 'ением', 'ениях',
  'ому', 'ему', 'ого', 'его', 'ыми', 'ими', 'ами', 'ями', 'ах', 'ях',
  'ешь', 'ишь', 'ете', 'ите', 'ует', 'уют', 'ают', 'яют', 'ит', 'ат', 'ят',
  'ыва', 'ива', 'ова', 'ева',
  'ый', 'ий', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю', 'ой', 'ей',
  'ов', 'ев', 'ам', 'ям', 'ом', 'ем', 'ть', 'ла', 'ло', 'ли', 'на',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й', 'л', 'н',
]

/** Грубый стемминг: срезаем окончание, оставляя основу не короче 4 символов. */
export function stem(word: string): string {
  let w = word
  if (w.length > 5 && (w.endsWith('ся') || w.endsWith('сь'))) w = w.slice(0, -2)
  for (const suf of SUFFIXES) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) return w.slice(0, -suf.length)
  }
  return w
}

export function tokenizeRu(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(stem)
}

/**
 * Клиент почти никогда не говорит терминами скрипта: «что будет через полгода»
 * вместо «точка Б». Поэтому к запросу добавляем слова той же темы.
 */
const EXPANSIONS: Array<[RegExp, string]> = [
  [/дорог|дешевл|денег|сумм|цен[аыу]|потян/i, 'стоимость рассрочка вложение выгода'],
  [/подума|посовету|сомнева|не уверен|решусь/i, 'сомнение решение останавливает готовность'],
  [
    /через полгода|через год|результат|изменит|будущ|станет|итог|добьем/i,
    'представьте почувствуете полгода картина результат цель мечта',
  ],
  [/телефон|гаджет|ролик|игра|ютуб|тикток/i, 'концентрация внимание дофамин экран'],
  [/не помнит|забыва|памят|стихи/i, 'память запоминание долговременная повторение'],
  [/не хочет|лень|мотивац|заставля|скучно/i, 'мотивация интерес вовлеченность желание'],
  [/репетитор|занимал|пробовал|курсы/i, 'репетитор попытки опыт результат деньги'],
  [/муж|жена|папа|супруг|вдвоем/i, 'решение вместе супруг обсудить'],
  [/оценк|двойк|тройк|троеч|успеваем/i, 'успеваемость оценки школа учеба'],
  [/егэ|огэ|экзамен|поступ/i, 'экзамен подготовка баллы поступление'],
]

/** Токены запроса + тематическое расширение */
export function expandQuery(text: string): string[] {
  const extra = EXPANSIONS.filter(([re]) => re.test(text))
    .map(([, words]) => words)
    .join(' ')
  return tokenizeRu(extra ? `${text} ${extra}` : text)
}

export type Bm25Doc = {
  tokens: string[]
  length: number
}

export type Bm25Index = {
  df: Map<string, number>
  avgLen: number
  total: number
}

export function buildBm25Index(docs: Bm25Doc[]): Bm25Index {
  const df = new Map<string, number>()
  let totalLen = 0
  for (const doc of docs) {
    totalLen += doc.length
    for (const t of new Set(doc.tokens)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  return {
    df,
    avgLen: docs.length ? totalLen / docs.length : 1,
    total: docs.length,
  }
}

const K1 = 1.5
const B = 0.75

export function bm25Score(query: string[], doc: Bm25Doc, index: Bm25Index): number {
  if (!query.length || !doc.length) return 0
  const tf = new Map<string, number>()
  for (const t of doc.tokens) tf.set(t, (tf.get(t) ?? 0) + 1)

  let score = 0
  for (const q of new Set(query)) {
    const f = tf.get(q)
    if (!f) continue
    const n = index.df.get(q) ?? 0
    const idf = Math.log(1 + (index.total - n + 0.5) / (n + 0.5))
    const norm = f * (K1 + 1)
    const denom = f + K1 * (1 - B + (B * doc.length) / index.avgLen)
    score += idf * (norm / denom)
  }
  return score
}
