/**
 * Разбор после звонка и личная статистика.
 * Продажа считается строго: ушла ссылка на оплату/рассрочку или анкета.
 */

import { GOLDEN_PATH } from '../data/trainingPath'
import type { Session } from '../store/sessionStore'

export type Debrief = {
  score: number
  sale: boolean
  doneSteps: string[]
  missedSteps: Array<{ title: string; focus: string; say: string }>
  focus: string[]
  verdict: string
}

/** Шаги, за которые Егор чаще всего теряет сделку — вес выше. */
const STEP_WEIGHT: Record<string, number> = {
  t1: 8,
  t2: 6,
  t3: 10,
  t4: 16,
  t5: 14,
  t6: 8,
  t7: 14,
  t8: 8,
  t9: 6,
  t10: 10,
}

function stepDone(session: Session, gateItemIds?: string[]): boolean {
  if (!gateItemIds?.length) return false
  return gateItemIds.every((id) => session.checked[id])
}

export function buildDebrief(session: Session): Debrief {
  const notes = session.notes
  const saleFromNotes = /ссылк|анкет|заявк|рассрочк|оформ|одобрен/i.test(
    `${notes.nextStep} ${notes.agreement} ${notes.freeNotes}`,
  )
  const sale = Boolean(session.checked.c1 && session.checked.c2) || saleFromNotes

  let earned = 0
  let total = 0
  const doneSteps: string[] = []
  const missedSteps: Debrief['missedSteps'] = []

  for (const step of GOLDEN_PATH) {
    const weight = STEP_WEIGHT[step.id] ?? 8
    total += weight
    if (stepDone(session, step.gateItemIds)) {
      earned += weight
      doneSteps.push(step.title)
    } else {
      missedSteps.push({ title: step.title, focus: step.coachFocus, say: step.say })
    }
  }

  const score = total ? Math.round((earned / total) * 100) : 0

  const focus = missedSteps
    .slice(0, 3)
    .map((m) => `${m.title}: ${m.focus}`)

  const verdict = sale
    ? score >= 70
      ? 'Продажа по структуре — так и держи.'
      : 'Продажа есть, но структура рваная. Повезло с клиентом.'
    : score >= 70
      ? 'Структура хорошая, но оформление не начато. Дожимай ссылкой.'
      : 'Не продажа. Слабая структура — начни с пропущенных шагов.'

  return { score, sale, doneSteps, missedSteps, focus, verdict }
}

export type PersonalStats = {
  calls: number
  sales: number
  conversion: number
  pointBRate: number
  scaleRate: number
  precloseRate: number
  lprRate: number
  avgScore: number
  weakest: string
}

function rate(list: Session[], itemId: string): number {
  if (!list.length) return 0
  return Math.round((list.filter((s) => s.checked[itemId]).length / list.length) * 100)
}

export function computePersonalStats(history: Session[]): PersonalStats {
  const calls = history.length
  if (!calls) {
    return {
      calls: 0,
      sales: 0,
      conversion: 0,
      pointBRate: 0,
      scaleRate: 0,
      precloseRate: 0,
      lprRate: 0,
      avgScore: 0,
      weakest: 'Нет данных — проведи первый звонок',
    }
  }

  const debriefs = history.map(buildDebrief)
  const sales = debriefs.filter((d) => d.sale).length
  const pointBRate = rate(history, 'p3')
  const scaleRate = rate(history, 'p4')
  const precloseRate = rate(history, 'pi3')
  const lprRate = rate(history, 'g5')

  const weakestPair = (
    [
      ['Точка Б', pointBRate],
      ['Шкала 0–10', scaleRate],
      ['4 вопроса до цены', precloseRate],
      ['ЛПР в начале', lprRate],
    ] as Array<[string, number]>
  ).sort((a, b) => a[1] - b[1])[0]

  return {
    calls,
    sales,
    conversion: Math.round((sales / calls) * 100),
    pointBRate,
    scaleRate,
    precloseRate,
    lprRate,
    avgScore: Math.round(debriefs.reduce((s, d) => s + d.score, 0) / calls),
    weakest: `${weakestPair[0]} — ${weakestPair[1]}%`,
  }
}
