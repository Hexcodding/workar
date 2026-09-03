/** Эталонная структура правильной работы на диагностике */

import type { DialogMetrics } from '../lib/dialogMeter'

export type TrainStep = {
  id: string
  order: number
  stageId: string
  title: string
  mustBeforePrice?: boolean
  gateItemIds?: string[]
  coachFocus: string
  say: string
  failIfMissingAfterMin?: number
}

export const GOLDEN_PATH: TrainStep[] = [
  {
    id: 't1',
    order: 1,
    stageId: 'greeting',
    title: 'Контакт + ЛПР',
    gateItemIds: ['g1', 'g5'],
    coachFocus: 'Кто решает? Все ли на связи? Тепло 20–30 сек.',
    say: 'Решение принимаете сами или вместе с ребёнком/супругом? Все ли сегодня на связи?',
    failIfMissingAfterMin: 5,
  },
  {
    id: 't2',
    order: 2,
    stageId: 'greeting',
    title: 'Программирование',
    gateItemIds: ['g4'],
    coachFocus: 'Согласие на план встречи.',
    say: 'Сначала вопросы, потом причина и как помогаем, в конце оформление если ок. Подходит?',
  },
  {
    id: 't3',
    order: 3,
    stageId: 'pains',
    title: 'Точка А',
    gateItemIds: ['p1', 'p2'],
    coachFocus: 'Глубокие боли + резюме словами мамы + заострение.',
    say: 'Правильно понимаю, вас как маму больше всего беспокоит…? Если не решать — к чему придёт?',
  },
  {
    id: 't4',
    order: 4,
    stageId: 'pains',
    title: 'Точка Б',
    mustBeforePrice: true,
    gateItemIds: ['p3'],
    coachFocus: 'Не додумывай. Оцифруй и зафиксируй дословно.',
    say: 'Как выглядит идеальная картина через полгода? По каким признакам поймёте, что всё получилось?',
    failIfMissingAfterMin: 20,
  },
  {
    id: 't5',
    order: 5,
    stageId: 'pains',
    title: 'Шкала 0–10',
    mustBeforePrice: true,
    gateItemIds: ['p4'],
    coachFocus: 'Обязательно «почему не 10?» — вскроет возражение.',
    say: 'По шкале 0–10, насколько важно решить? Почему не 10?',
    failIfMissingAfterMin: 25,
  },
  {
    id: 't6',
    order: 6,
    stageId: 'pitch',
    title: 'Причина + преза коротко',
    gateItemIds: ['pi1'],
    coachFocus: '5–7 мин. Боль → решение → вопрос. Без простыни.',
    say: 'Вы хотели [точка Б] — поэтому вот этот блок. Как вам?',
  },
  {
    id: 't7',
    order: 7,
    stageId: 'pitch',
    title: '4 вопроса до цены',
    mustBeforePrice: true,
    gateItemIds: ['pi3'],
    coachFocus: 'Все 4 с паузами. Пока не пройдены — цену не называть.',
    say: 'Как вам подход? / Что понравилось? / Достоин ли ребёнок? / Готовы начать?',
  },
  {
    id: 't8',
    order: 8,
    stageId: 'finance',
    title: 'Цена через Б',
    gateItemIds: ['f1'],
    coachFocus: 'Сначала мечта клиента, потом цифра.',
    say: 'Вы хотели [точка Б]. Именно это за … в месяц. Как вам такие условия?',
  },
  {
    id: 't9',
    order: 9,
    stageId: 'objections',
    title: 'Возражения без спора',
    coachFocus: 'Присоединение → истина → аргумент. Без CRM-дедлайна.',
    say: 'Понимаю. Вас останавливает программа, стоимость или “надо ли ребёнку”?',
  },
  {
    id: 't10',
    order: 10,
    stageId: 'close',
    title: 'Оформление = продажа',
    gateItemIds: ['c1', 'c2'],
    coachFocus:
      'Продажа только когда ушла ссылка на оплату/рассрочку или анкета. «Подумаю» — не продажа.',
    say: 'Давайте сейчас оформлю ссылку на рассрочку/оплату — заполним вместе, это ни к чему жёстко не обязывает до одобрения.',
  },
]

export function nextTrainStep(checked: Record<string, boolean>): TrainStep {
  for (const step of GOLDEN_PATH) {
    if (!step.gateItemIds?.length) continue
    const done = step.gateItemIds.every((id) => checked[id])
    if (!done) return step
  }
  return GOLDEN_PATH[GOLDEN_PATH.length - 1]
}

export function trainingGates(input: {
  checked: Record<string, boolean>
  elapsedMin: number
  talkingPrice: boolean
  metrics?: DialogMetrics
}): { blocked: boolean; reason: string; step: TrainStep } {
  const step = nextTrainStep(input.checked)
  const hasB = Boolean(input.checked.p3)
  const hasScale = Boolean(input.checked.p4)
  const hasPre = Boolean(input.checked.pi3)

  if (input.talkingPrice && !hasB) {
    return {
      blocked: true,
      reason: 'СТОП ЦЕНУ: нет точки Б',
      step: GOLDEN_PATH.find((s) => s.id === 't4')!,
    }
  }
  if (input.talkingPrice && !hasPre) {
    return {
      blocked: true,
      reason: 'СТОП ЦЕНУ: нет 4 вопросов предзакрытия',
      step: GOLDEN_PATH.find((s) => s.id === 't7')!,
    }
  }
  if (input.talkingPrice && !hasScale) {
    return {
      blocked: true,
      reason: 'Перед ценой сними шкалу 0–10',
      step: GOLDEN_PATH.find((s) => s.id === 't5')!,
    }
  }

  // Клиент сейчас разговорился — не рвём её рассказ просроченным шагом
  const clientHoldsFloor = Boolean(
    input.metrics && input.metrics.clientShare > 0.6 && input.metrics.utterances >= 3,
  )

  for (const s of GOLDEN_PATH) {
    if (s.failIfMissingAfterMin == null) continue
    if (!s.gateItemIds?.some((id) => !input.checked[id])) continue

    // Дедлайн шага = минуты ИЛИ достаточное число обменов репликами.
    // Быстрый разговорчивый клиент доходит до шага раньше, медленный — позже.
    const byMinutes = input.elapsedMin >= s.failIfMissingAfterMin
    const byExchanges = input.metrics
      ? input.metrics.totalExchanges >= s.failIfMissingAfterMin * 1.6
      : false
    const overdue = byMinutes || byExchanges

    if (overdue && !clientHoldsFloor) {
      return { blocked: true, reason: `Просрочен шаг: ${s.title}`, step: s }
    }
  }

  return { blocked: false, reason: '', step }
}
