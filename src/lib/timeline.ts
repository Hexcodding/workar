/**
 * Сравнение с эталонным таймлайном успешных звонков.
 * Данные строятся скриптом materials/_benchmark_timeline.mjs по 88 sale-звонкам.
 */

import benchmarkJson from '../data/generated/benchmark.json'

export type BenchmarkMilestone = {
  id: string
  title: string
  calls: number
  reliable: boolean
  p25: number
  median: number
  p75: number
}

export type Benchmark = {
  builtAt: string
  basedOn: { saleCalls: number; source: string }
  milestones: BenchmarkMilestone[]
}

export const benchmark = benchmarkJson as Benchmark

const DETECT: Record<string, { items: string[]; re: RegExp }> = {
  contact: { items: ['g1'], re: /меня зовут|как пройд[её]т|займ[её]т.{0,20}час/i },
  lpr: {
    items: ['g5'],
    re: /кто.{0,20}(принимает решени|решает)|все ли на связи|вместе с (мужем|папой)/i,
  },
  pains: {
    items: ['p1'],
    re: /что вас беспокоит|какие трудности|с чем не справля|что не получается/i,
  },
  pointB: { items: ['p3'], re: /представьте|точк[ауи]\s*б|почувствуете|через полгода/i },
  scale: { items: ['p4'], re: /от\s*0\s*до\s*10|по шкале|почему не 10/i },
  pitch: { items: ['pi1'], re: /как мы работаем|наша программа|модул|платформ/i },
  preclose: { items: ['pi3'], re: /что понравилось|достоин|готовы (начать|приступ)/i },
  price: { items: ['f1'], re: /стоимость|рассрочк|в месяц|тысяч/i },
  close: { items: ['c1'], re: /ссылк|анкет|заявк|оформ(им|ля)/i },
}

export type TimelineStatus = {
  nextTitle: string
  benchMedian: number
  elapsedMin: number
  lateByMin: number
  behind: boolean
  message: string
}

function isDone(id: string, checked: Record<string, boolean>, full: string): boolean {
  const d = DETECT[id]
  if (!d) return false
  if (d.items.some((item) => checked[item])) return true
  return d.re.test(full)
}

export function compareTimeline(input: {
  elapsedMin: number
  checked: Record<string, boolean>
  fullText: string
}): TimelineStatus | null {
  const full = input.fullText.toLowerCase()
  const pending = benchmark.milestones
    .filter((m) => m.reliable)
    .sort((a, b) => a.median - b.median)
    .find((m) => !isDone(m.id, input.checked, full))

  if (!pending) return null

  const lateByMin = Math.round((input.elapsedMin - pending.median) * 10) / 10
  const behind = input.elapsedMin > pending.p75

  const message = behind
    ? `${pending.title}: эталон делает это к ${pending.median} мин, ты на ${Math.floor(input.elapsedMin)}-й. Опоздание ${Math.max(0, Math.round(lateByMin))} мин.`
    : `Следующее по эталону: ${pending.title} (медиана ${pending.median} мин).`

  return {
    nextTitle: pending.title,
    benchMedian: pending.median,
    elapsedMin: Math.round(input.elapsedMin * 10) / 10,
    lateByMin,
    behind,
    message,
  }
}
