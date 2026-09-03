import {
  bm25Score,
  buildBm25Index,
  expandQuery,
  tokenizeRu,
  type Bm25Index,
} from '../lib/ruText'
import knowledgeJson from './generated/knowledge.json'

export type KnowledgePhrase = {
  text: string
  seller: string
  score: number
}

export type KnowledgeObjection = {
  trigger: string
  answer: string
  category?: string
  source?: string
}

export type KnowledgeQuestion = {
  text: string
  tip?: string
  stage: string
  block?: string
  audience?: string
}

export type KnowledgeTrigger = {
  text: string
  tip?: string
  stage: string
  block?: string
  kind?: string
}

export type KnowledgePack = {
  builtAt: string
  stats: {
    total: number
    sale: number
    noSale: number
  }
  phrases: Record<string, KnowledgePhrase[]>
  questions?: KnowledgeQuestion[]
  triggers?: KnowledgeTrigger[]
  antiPatterns: Array<{ text: string; seller: string }>
  objections: KnowledgeObjection[]
  egorFocus: string[]
}

export const knowledge = knowledgeJson as KnowledgePack

/** Фразы, которые коуч не должен предлагать никогда: давление дедлайном CRM. */
const FORBIDDEN =
  /\bcrm\b|закроется|заявк[а-яё]*\s*(закрыв|удерж|закро)|только на диагностике|бонус[а-яё]*.{0,40}только|скидк[а-яё]*.{0,30}(удерж|держ)|меня будут ругать/i

function isForbidden(text: string): boolean {
  return FORBIDDEN.test(text)
}

/** Продавцы-эталоны получают приоритет в выдаче. */
function sellerWeight(seller: string): number {
  if (/леонард|антон/i.test(seller)) return 1.25
  if (/база парта/i.test(seller)) return 1.2
  if (/полина/i.test(seller)) return 1.05
  return 1
}

type Doc = {
  text: string
  tokens: string[]
  length: number
  stage: string
  weight: number
  kind: 'phrase' | 'question' | 'trigger' | 'objection'
  question?: KnowledgeQuestion
  trigger?: KnowledgeTrigger
  objection?: KnowledgeObjection
}

function makeDoc(
  text: string,
  extra: Omit<Doc, 'text' | 'tokens' | 'length'>,
): Doc {
  const tokens = tokenizeRu(text)
  return { text, tokens, length: tokens.length || 1, ...extra }
}

function buildDocs(): Doc[] {
  const docs: Doc[] = []

  for (const [stage, list] of Object.entries(knowledge.phrases || {})) {
    for (const p of list) {
      if (isForbidden(p.text)) continue
      docs.push(
        makeDoc(p.text, {
          stage,
          kind: 'phrase',
          weight: sellerWeight(p.seller) * (1 + Math.min(p.score, 12) / 40),
        }),
      )
    }
  }

  for (const q of knowledge.questions || []) {
    if (isForbidden(q.text)) continue
    docs.push(
      makeDoc(`${q.text} ${q.tip ?? ''} ${q.block ?? ''}`, {
        stage: q.stage,
        kind: 'question',
        weight: 1.25,
        question: q,
      }),
    )
  }

  for (const t of knowledge.triggers || []) {
    if (isForbidden(t.text)) continue
    docs.push(
      makeDoc(`${t.text} ${t.tip ?? ''} ${t.block ?? ''}`, {
        stage: t.stage,
        kind: 'trigger',
        weight: t.kind === 'oneshot' || t.kind === 'close' ? 1.2 : 1.05,
        trigger: t,
      }),
    )
  }

  for (const o of knowledge.objections || []) {
    if (isForbidden(o.answer)) continue
    docs.push(
      makeDoc(`${o.trigger} ${o.category ?? ''}`, {
        stage: 'objections',
        kind: 'objection',
        weight: 1.3,
        objection: o,
      }),
    )
  }

  return docs
}

const DOCS: Doc[] = buildDocs()
const INDEX: Bm25Index = buildBm25Index(DOCS)

type SearchOptions = {
  stageId?: string
  kinds?: Doc['kind'][]
  limit?: number
  minScore?: number
}

function search(query: string, options: SearchOptions = {}): Array<{ doc: Doc; score: number }> {
  const { stageId, kinds, limit = 3, minScore = 0 } = options
  const q = expandQuery(query)
  const pool = kinds ? DOCS.filter((d) => kinds.includes(d.kind)) : DOCS

  if (!q.length) {
    const fallback = stageId ? pool.filter((d) => d.stage === stageId) : pool
    return fallback.slice(0, limit).map((doc) => ({ doc, score: 0 }))
  }

  const scored = pool
    .map((doc) => {
      const base = bm25Score(q, doc, INDEX)
      const stageBonus = stageId && doc.stage === stageId ? 1.6 : 1
      return { doc, score: base * doc.weight * stageBonus }
    })
    .filter((x) => x.score > minScore)
    .sort((a, b) => b.score - a.score)

  // на пустой выдаче лучше дать хоть что-то по этапу, чем ничего
  if (!scored.length) {
    const fallback = stageId ? pool.filter((d) => d.stage === stageId) : pool
    return fallback.slice(0, limit).map((doc) => ({ doc, score: 0 }))
  }

  const seen = new Set<string>()
  const out: Array<{ doc: Doc; score: number }> = []
  for (const item of scored) {
    const key = item.doc.text.slice(0, 60).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

/** Лучшие фразы этапа под последние слова клиента */
export function retrievePhrases(stageId: string, recentText: string, limit = 3): string[] {
  return search(recentText, {
    stageId,
    kinds: ['phrase'],
    limit,
  }).map((x) => x.doc.text)
}

/** Без явного маркера возражения не подсовываем отработку: иначе ложные тревоги. */
const OBJECTION_CUE =
  /дорог|дешевл|денег|цена|цену|стоит|стоимост|рассрочк|подума|посовету|с мужем|с женой|не готов|сомнева|не уверен|попозже|позже|некогда|нет времени|перегруж|переезж|сам[аи].{0,10}справ|отличник|профориентац|неусидчив|несерьезн|несерьёзн|програм[а-яё]+ посмотр|материал/i

/**
 * Тема возражения должна звучать в самой реплике. Иначе слабое текстовое
 * совпадение отдавало ответ из чужой категории: боль про память тянула
 * отработку «надо посоветоваться с мужем».
 */
const CATEGORY_CUE: Record<string, RegExp> = {
  price: /дорог|денег|деньг|цена|цену|стоимост|дешевл|потянем|бюджет|сумм/i,
  деньги: /дорог|денег|деньг|цена|цену|стоимост|дешевл|потянем|бюджет|сумм/i,
  spouse: /муж|жен[аыое]|супруг|пап|посовет|обсуд|вдво[её]м/i,
  'третье лицо': /муж|жен[аыое]|супруг|пап|посовет|обсуд/i,
  think: /подума|решим|не готов|не определ/i,
  сомнение: /подума|сомнева|не уверен|не готов/i,
  time: /времен|некогда|загруж|перегруж|успева/i,
  время: /времен|некогда|загруж|перегруж|успева/i,
  tried: /пробовал|репетитор|занимал|не помог|толку/i,
  childWill: /не хочет|не хочется|заставля|ленив|лень|бросит|не интересно|не будет/i,
  later: /позже|потом|сентябр|каникул|отпуск|летом|рано|попозже/i,
  откладывание: /позже|потом|сентябр|каникул|отпуск|летом|рано|попозже/i,
  online: /онлайн|экран|вживую|дистанц/i,
  selfLearn: /сами|своими силами/i,
}

export function retrieveObjection(recentText: string): KnowledgeObjection | null {
  if (!OBJECTION_CUE.test(recentText)) return null
  const hits = search(recentText, { kinds: ['objection'], limit: 6, minScore: 2 })
  for (const hit of hits) {
    const objection = hit.doc.objection
    if (!objection) continue
    const cue = objection.category ? CATEGORY_CUE[objection.category.toLowerCase()] : undefined
    // маркер категории сам подтверждает тему, поэтому слабого совпадения хватает;
    // без известной категории полагаемся только на сильное совпадение
    if (cue) {
      if (cue.test(recentText)) return objection
      continue
    }
    if (hit.score >= 9) return objection
  }
  return null
}

/** Вопросы из базы Парты под текущий этап; audience переключает детский банк */
export function retrieveQuestions(
  stageId: string,
  recentText: string,
  limit = 2,
  audience?: 'parent' | 'kid',
): KnowledgeQuestion[] {
  const hits = search(recentText, {
    stageId,
    kinds: ['question'],
    limit: audience ? limit * 4 : limit,
  })
    .map((x) => x.doc.question)
    .filter((q): q is KnowledgeQuestion => Boolean(q))

  if (!audience) return hits.slice(0, limit)

  const matched = hits.filter((q) => q.audience === audience)
  return (matched.length ? matched : hits).slice(0, limit)
}

/** Триггеры / заготовки / сторителлинг из вкладки Парты */
export function retrieveTriggers(
  stageId: string,
  recentText: string,
  limit = 2,
): KnowledgeTrigger[] {
  const hits = search(recentText, { stageId, kinds: ['trigger'], limit })
  return hits.map((x) => x.doc.trigger).filter((t): t is KnowledgeTrigger => Boolean(t))
}

/** Диагностика ретривера (используется в dev-проверках) */
export function debugSearch(query: string, stageId?: string) {
  return search(query, { stageId, limit: 5 }).map((x) => ({
    kind: x.doc.kind,
    stage: x.doc.stage,
    score: Math.round(x.score * 100) / 100,
    text: x.doc.text.slice(0, 90),
  }))
}
