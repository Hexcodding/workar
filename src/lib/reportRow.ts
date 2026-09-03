/**
 * Строка для таблицы Егора.
 *
 * Это его собственная отчётность: какие диагностики провёл и чем кончилось.
 * Ничего больше — профиль ребёнка, боли и точка Б живут отдельно, в блоке для
 * куратора, и сюда не текут. Поэтому все ячейки собираются из карточки
 * разговора напрямую, а не из текста, который он писал куратору.
 *
 * Порядок колонок повторяет его лист один в один: Дата, Номер, Источник,
 * Имя МСТ, Класс, Подача в банк, Оплата, Дата оплаты, Сумма чека, Чистая
 * выручка, Оплаченный тариф, Возражения, Ссылка на запись, Комментарий.
 * Строка уходит в буфер через табуляцию — Google-таблица сама раскладывает
 * её по ячейкам, разносить руками ничего не надо.
 *
 * Чистую выручку не считаем: в листе она формулой, и текст затёр бы её.
 */
import type { CardEntry, Session } from '../store/sessionStore'
import { buildDebrief } from './debrief'

export type ReportContext = { session: Session; card: Map<string, CardEntry> }

export type ReportColumn = {
  title: string
  get: (ctx: ReportContext) => string
  /** колонки с формулой отдаём пустыми, чтобы не затирать лист */
  skip?: boolean
}

const value = (id: string) => (ctx: ReportContext) => ctx.card.get(id)?.value ?? ''

function date(session: Session): Date {
  return new Date(session.startedAt ?? session.createdAt)
}

function ddmmyyyy(d: Date): string {
  return d.toLocaleDateString('ru-RU')
}

const WORD_GRADE: Record<string, string> = {
  перв: '1',
  втор: '2',
  трет: '3',
  четв: '4',
  пят: '5',
  шест: '6',
  седьм: '7',
  восьм: '8',
  девят: '9',
  десят: '10',
  одиннадцат: '11',
}

/** В таблице класс — одна цифра, а мама говорит «во втором классе» */
function grade(ctx: ReportContext): string {
  const raw = ctx.card.get('grade')?.value ?? ''
  const digit = raw.match(/\d{1,2}/)
  if (digit) return digit[0]
  for (const [stem, num] of Object.entries(WORD_GRADE)) {
    if (raw.toLowerCase().includes(stem)) return num
  }
  return ''
}

function phone(ctx: ReportContext): string {
  const raw = ctx.card.get('contact')?.quote ?? ''
  const m = raw.match(/(\+7|\b8)[\s(-]?\d{3}[\s)-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/)
  return m ? m[0].replace(/[^\d+]/g, '') : ''
}

const BANK = /рассрочк|заявк[а-яё]*\s*в банк|подали в банк|одобрен|сбер|тинькоф|т-банк|альфа/i
const PAID = /продаж|оплат|куплен/i


function sold(ctx: ReportContext): boolean {
  const { session } = ctx
  if (session.notes.result) return PAID.test(session.notes.result)
  return buildDebrief(session).sale
}

export const REPORT_COLUMNS: ReportColumn[] = [
  { title: 'Дата', get: ({ session }) => ddmmyyyy(date(session)) },
  { title: 'Номер', get: phone },
  { title: 'Источник', get: value('source') },
  // «Имя МСТ» Егор ведёт сам, вставка не должна его перетирать
  { title: 'Имя МСТ', get: () => '', skip: true },
  { title: 'Класс', get: grade },
  {
    title: 'Подача в банк',
    get: (ctx) =>
      BANK.test(`${ctx.card.get('money')?.quote ?? ''} ${ctx.session.notes.agreement}`) ? 'Да' : '',
  },
  { title: 'Оплата', get: (ctx) => (sold(ctx) ? 'Да' : '') },
  { title: 'Дата оплаты', get: (ctx) => (sold(ctx) ? ddmmyyyy(date(ctx.session)) : '') },
  {
    title: 'Сумма чека',
    get: ({ session }) => {
      if (session.notes.amount) return session.notes.amount.replace(/[^\d]/g, '')
      return session.money?.total ?? ''
    },
  },
  { title: 'Чистая выручка', get: () => '', skip: true },
  {
    title: 'Оплаченный тариф',
    get: ({ session }) => (session.money?.monthly ? `${session.money.monthly} в месяц` : ''),
  },
  {
    title: 'Возражения/причина отказа',
    get: ({ card }) => card.get('stopper')?.value ?? card.get('decision')?.value ?? '',
  },
  { title: 'Ссылка на запись', get: () => '' },
  {
    title: 'Комментарий',
    get: ({ card }) => {
      const parts = [
        card.get('wish')?.value,
        card.get('readiness') ? `готовность ${card.get('readiness')?.value}` : '',
        card.get('nextStep')?.value,
      ]
      // без обёртки map передал бы вторым доводом индекс, и он стал бы лимитом
      return parts
        .filter((part): part is string => Boolean(part))
        .map((part) => short(part))
        .join('; ')
    },
  },
]

/** В ячейку нужна суть, а не абзац: длинную цитату режем по слову */
function short(text: string, limit = 90): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  return `${cut.slice(0, space > 30 ? space : limit)}…`
}

/** Табуляция и перевод строки развалили бы вставку по ячейкам */
function cell(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function context(session: Session, card: CardEntry[]): ReportContext {
  return { session, card: new Map(card.map((e) => [e.id, e])) }
}

export function reportHeader(): string {
  return REPORT_COLUMNS.map((c) => c.title).join('\t')
}

export function reportRow(session: Session, card: CardEntry[] = session.card ?? []): string {
  const ctx = context(session, card)
  return REPORT_COLUMNS.map((c) => cell(c.get(ctx))).join('\t')
}

/** Что именно уйдёт в лист: перед вставкой это стоит увидеть глазами */
export function reportCells(
  session: Session,
  card: CardEntry[] = session.card ?? [],
): Array<{ title: string; value: string }> {
  const ctx = context(session, card)
  return REPORT_COLUMNS.map((c) => ({ title: c.title, value: cell(c.get(ctx)) }))
}

/** Сколько колонок реально заполнено: пустая строка в таблице бесполезна */
export function reportFilled(session: Session, card: CardEntry[] = session.card ?? []): number {
  const ctx = context(session, card)
  return REPORT_COLUMNS.filter((c) => !c.skip && cell(c.get(ctx))).length
}
