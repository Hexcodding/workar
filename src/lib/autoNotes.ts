/**
 * Отчёт для куратора заполняется сам.
 *
 * Всё, что Егор мог бы записать руками, к концу звонка уже лежит в карточке:
 * боли, точка Б, готовность, что тормозит, на чём договорились. Руками он
 * только правит, если формулировка не нравится, — и с этого момента поле
 * становится его, автозаполнение туда больше не лезет.
 */
import type { Dossier, DossierEntry } from '../data/dossier'
import type { CuratorNotes } from '../store/sessionStore'

export type AutoField = 'pains' | 'pointB' | 'readiness' | 'objections' | 'agreement' | 'result'
export type AutoNotes = Partial<Record<AutoField, string>>

/** Боль собираем в том порядке, в каком её слышит куратор, а не по алфавиту */
const PAIN_FIELDS = [
  'why',
  'grades',
  'weakSubjects',
  'sinceWhen',
  'understanding',
  'memory',
  'attention',
  'homeworkTime',
  'homeworkWith',
  'motivation',
  'gadgets',
  'selfEsteem',
  'stress',
  'social',
  'conflicts',
  'tried',
]

const GOAL_FIELDS = ['wish', 'goalNumber', 'deadline', 'momEmotion']
const BLOCK_FIELDS = ['stopper', 'money', 'decision']

const MAX_PAINS = 8

/** Длинную цитату режем по слову: в отчёте важна суть, а не стенограмма */
function short(text: string, limit = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  return `${cut.slice(0, space > 40 ? space : limit)}…`
}

function line(entry: DossierEntry): string {
  const from = entry.role === 'kid' ? ' (со слов ребёнка)' : ''
  return `${entry.field.title}: ${short(entry.value)}${from}`
}

function collect(entries: Map<string, DossierEntry>, ids: string[], limit = 99): string {
  const said = new Set<string>()
  return ids
    .map((id) => entries.get(id))
    .filter((e): e is DossierEntry => Boolean(e))
    // одна реплика мамы часто закрывает сразу два поля; куратору незачем
    // читать её дважды под разными заголовками
    .filter((e) => {
      const key = e.value.replace(/\s+/g, ' ').trim().toLowerCase()
      return said.has(key) ? false : said.add(key)
    })
    .slice(0, limit)
    .map(line)
    .join('\n')
}

const SOLD = /ссылк|анкет|заявк|оплат|рассрочк|оформ|берем|бер[её]м|записыва/i
const THINKING = /подума|посовет|с мужем|с папой|попозже|после (каникул|отпуска|нового года)/i
const REFUSED = /не интересно|не будем|отказ|не подходит/i

/** Итог звонка виден по последним словам мамы, отдельного поля для него нет */
function resultOf(entries: Map<string, DossierEntry>): string {
  const deal = entries.get('nextStep')
  const stop = entries.get('stopper')
  if (deal && SOLD.test(deal.quote)) return 'продажа'
  if (stop && REFUSED.test(stop.quote)) return 'отказ'
  if (stop && THINKING.test(stop.quote)) return 'думает'
  return ''
}

export function autoNotes(dossier: Dossier | null): AutoNotes {
  if (!dossier?.entries.length) return {}
  const byId = new Map(dossier.entries.map((e) => [e.field.id, e]))

  const out: AutoNotes = {
    pains: collect(byId, PAIN_FIELDS, MAX_PAINS),
    pointB: collect(byId, GOAL_FIELDS),
    readiness: byId.get('readiness')?.value ?? '',
    objections: collect(byId, BLOCK_FIELDS),
    agreement: byId.get('nextStep') ? short(byId.get('nextStep')!.quote, 200) : '',
    result: resultOf(byId),
  }

  for (const key of Object.keys(out) as AutoField[]) {
    if (!out[key]) delete out[key]
  }
  return out
}

/**
 * Кладём автотекст только в поля, которых Егор не касался: своё он узнаёт
 * по тому, что там уже не то, что мы писали в прошлый раз.
 */
export function applyAuto(
  notes: CuratorNotes,
  auto: AutoNotes,
  previous: AutoNotes,
): { notes: CuratorNotes; auto: AutoNotes } | null {
  const next = { ...notes }
  const owned: AutoNotes = { ...previous }
  let changed = false

  for (const key of Object.keys(auto) as AutoField[]) {
    const value = auto[key] ?? ''
    const current = notes[key] ?? ''
    // правку Егора видно по тому, что в поле уже не наш прошлый текст;
    // снимок при этом не трогаем, иначе поле снова станет «нашим»
    const mine = current === '' || current === (previous[key] ?? '')
    if (!mine || current === value) continue
    next[key] = value
    owned[key] = value
    changed = true
  }

  return changed ? { notes: next, auto: owned } : null
}
