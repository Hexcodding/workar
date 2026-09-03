/**
 * Предсказатель слива в «подумаю».
 *
 * Веса откалиброваны на корпусе (117 звонков, 91 sale / 26 не-sale,
 * materials/SLIP_SIGNALS.md). Ключевой вывод калибровки: слова клиента
 * («интересно», «подумаю») одинаково часто звучат и в удачных звонках —
 * их отрабатывают. Реально разделяют структура (нет шкалы / Б / preclose)
 * и динамика диалога (клиент остыл, продавец в монологе).
 */

import type { DialogMetrics } from './dialogMeter'

export type SlipRisk = {
  score: number
  level: 'ok' | 'watch' | 'danger'
  reasons: string[]
  say: string
}

type Input = {
  elapsedMin: number
  checked: Record<string, boolean>
  fullText: string
  recentText: string
  metrics?: DialogMetrics
}

const RESCUE_SAY = [
  'Скажите честно, что сейчас останавливает — программа, деньги или сомнение «надо ли ребёнку»?',
  'Если бы решение зависело только от вас и деньги были — вы бы начали? Тогда давайте разберём именно то, что мешает.',
  'Давайте по-честному: по шкале 0–10, насколько вы сейчас готовы стартовать? Почему не 10?',
]

export function computeSlipRisk(input: Input): SlipRisk {
  const { elapsedMin, checked, metrics } = input
  const full = input.fullText.toLowerCase()
  const recent = input.recentText.toLowerCase()

  const hasPointB = Boolean(checked.p3) || /точк[ауи]\s*б|представьте|почувствуете/.test(full)
  const hasScale = Boolean(checked.p4) || /от\s*0\s*до\s*10|десятибальн|почему не 10/.test(full)
  const hasPreclose =
    Boolean(checked.pi3) ||
    (/что понравилось/.test(full) && /достоин/.test(full) && /готов[аы]/.test(full))
  const hasLpr =
    Boolean(checked.g5) || /кто.*(решени|принимает)|все ли на связи|будет присутствовать/.test(full)

  const priceTalked = /стоим|тысяч|рассрочк|в месяц|оплат/.test(full)
  const closeMoving =
    /ссылк|анкет|заявк|оформ(им|ля)|одобрен|первый плат[её]ж|куратор.{0,30}(напиш|свяж|направ)/.test(
      recent,
    )

  const reasons: string[] = []
  let score = 0

  const add = (points: number, why: string) => {
    score += points
    reasons.push(why)
  }

  // Структура — главный предиктор по корпусу
  if (!hasScale && (priceTalked || elapsedMin >= 25)) add(14, 'нет шкалы 0–10')
  if (!hasPointB && (priceTalked || elapsedMin >= 20)) add(14, 'нет точки Б')
  if (priceTalked && !hasPreclose) add(10, 'цена без 4 вопросов')
  if (!hasLpr && elapsedMin >= 12) add(8, 'ЛПР не подтверждён')

  // Динамика диалога — только если микрофон реально слышит клиента
  if (metrics?.clientAudible) {
    if (metrics.clientCooling) add(15, 'клиент отвечает односложно')
    if (metrics.monologue) add(10, 'ты в монологе')
    if (metrics.silenceSec > 60) add(8, 'клиент давно молчит')
    if (metrics.clientReplies >= 4 && metrics.clientAvgChars <= 25)
      add(7, 'ответы клиента очень короткие')
  }

  // Поздние словесные маркеры — только как добавка
  if (/подума|обсуд(им|ить)|решим позже/.test(recent) && !closeMoving)
    add(12, '«подумаю» без движения к оформлению')
  if (/после (отпуска|каникул|нового года)|в следующем (месяце|году)|попозже/.test(recent))
    add(10, 'откладывает старт')
  if (/пришлите|скиньте|отправьте.{0,20}(материал|информац|презентац)/.test(recent))
    add(8, 'просит «прислать материалы»')
  if (
    /с мужем|с женой|посовет/.test(recent) &&
    elapsedMin >= 30 &&
    !hasLpr
  )
    add(10, 'второй ЛПР всплыл поздно')

  // Движение к оформлению сильно снижает риск
  if (closeMoving) {
    score -= 35
    reasons.push('идёт оформление (риск снижен)')
  }
  if (hasPreclose) score -= 6

  score = Math.max(0, Math.min(100, Math.round(score)))

  // До 10 минут звонка предсказывать нечего
  if (elapsedMin < 10) {
    return { score: Math.min(score, 25), level: 'ok', reasons, say: RESCUE_SAY[0] }
  }

  const level: SlipRisk['level'] = score >= 60 ? 'danger' : score >= 38 ? 'watch' : 'ok'
  const say = !hasScale ? RESCUE_SAY[2] : level === 'danger' ? RESCUE_SAY[1] : RESCUE_SAY[0]

  return { score, level, reasons: reasons.slice(0, 4), say }
}
