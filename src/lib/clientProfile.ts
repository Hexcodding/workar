/**
 * Профиль клиента и предсказание возражения.
 * Цель — вооружить Егора отработкой до того, как возражение прозвучало.
 */

import { retrieveObjection } from '../data/knowledgePack'
import type { Utterance } from './dialogMeter'

export type ClientType = 'unknown' | 'anxious' | 'thrifty' | 'controlling' | 'skeptic' | 'tired'

export type PredictedObjection = {
  id: string
  label: string
  probability: number
  why: string
  say: string
}

export type ClientProfile = {
  type: ClientType
  typeLabel: string
  tone: string
  predicted: PredictedObjection[]
}

const TYPE_RULES: Array<{ type: ClientType; label: string; tone: string; cues: RegExp[] }> = [
  {
    type: 'anxious',
    label: 'тревожная',
    tone: 'Успокаивай и давай опору: конкретика, шаги, «вы не одна».',
    cues: [/боюсь|переживаю|страшно|волну|тревож|а если не получится|не навред/i],
  },
  {
    type: 'thrifty',
    label: 'считает деньги',
    tone: 'Говори цифрами и сравнением с тем, что уже тратит. Не оправдывайся за цену.',
    cues: [/(?<!не)дорого|скидк|дешевл|бюджет|сколько стоит|рассрочк|денег нет|экономи/i],
  },
  {
    type: 'controlling',
    label: 'контролирующая',
    tone: 'Дай ей управление: выбор, отчётность куратора, прозрачный план.',
    cues: [/я хочу понимать|отчет|отч[её]т|контролир|как вы проверя|кто отвечает|гаранти/i],
  },
  {
    type: 'skeptic',
    label: 'скептик',
    tone: 'Не дави, приводи механику и кейсы. Соглашайся с сомнением, потом факт.',
    cues: [/уже пробовали|не верю|очередн|обещал|все так говорят|реклам|развод|онлайн.{0,15}несерь/i],
  },
  {
    type: 'tired',
    label: 'выгоревшая',
    tone: 'Снимай вину и говори про её ресурс, а не только про ребёнка.',
    cues: [/устала|сил нет|опустила руки|надоело|не знаю что делать|срываюсь|кричу/i],
  },
]

const PREDICTORS: Array<{
  id: string
  label: string
  weight: number
  why: string
  cues: RegExp[]
  probe: string
}> = [
  {
    id: 'spouse',
    label: 'Надо посоветоваться с мужем',
    weight: 0.75,
    why: 'решение принимает не она одна',
    cues: [/муж|жена|папа|супруг|мы вдвоем|мы вдво[её]м|отец реб/i],
    probe: 'Скажите, а решение по обучению вы принимаете вместе с мужем? Тогда давайте позовём его к концу встречи на 5 минут.',
  },
  {
    id: 'price',
    label: 'Это дорого',
    weight: 0.7,
    why: 'бюджет уже проговаривался',
    cues: [/дорого|бюджет|денег|скидк|дешевл|не потянем|ипотек|одна воспитыв|мать-одиночк/i],
    probe: 'Чтобы не тратить ваше время: какой формат оплаты вам был бы комфортен — сразу или частями по месяцам?',
  },
  {
    id: 'triedBefore',
    label: 'Уже пробовали, не помогло',
    weight: 0.65,
    why: 'есть неудачный опыт репетиторов и курсов',
    cues: [/репетитор|курс|занимал|пробовал|психолог|ничего не помог/i],
    probe: 'А что именно в прошлых занятиях не сработало? Хочу не повторить их ошибку.',
  },
  {
    id: 'childWill',
    label: 'Ребёнок не захочет заниматься',
    weight: 0.6,
    why: 'мама сомневается в мотивации ребёнка',
    cues: [/не хочет|не будет заниматься|не заставишь|ленив|(?<![а-яё])бросит|не досмотр/i],
    probe: 'Как думаете, если ему станет интересно и начнёт получаться — он сам захочет продолжать?',
  },
  {
    id: 'time',
    label: 'Нет времени / загружен',
    weight: 0.55,
    why: 'у ребёнка плотный график',
    cues: [/некогда|нет времени|загруж|секци|музыкальн|спорт|тренировк|олимпиад/i],
    probe: 'Сколько свободных вечеров в неделю реально есть? Мы соберём расписание под них.',
  },
  {
    id: 'later',
    label: 'Начнём позже',
    weight: 0.5,
    why: 'звучали отсылки к «потом»',
    cues: [/после (отпуска|каникул|нового года)|летом|в сентябре|попозже|пока рано/i],
    probe: 'Понимаю. А что изменится к тому моменту? Обычно проблема к сентябрю только дороже стоит.',
  },
]

export function buildClientProfile(utterances: Utterance[], fullText: string): ClientProfile {
  const clientText = utterances
    .filter((u) => u.role !== 'seller')
    .map((u) => u.text)
    .join(' ')
  const haystack = clientText || fullText

  let type: ClientType = 'unknown'
  let typeLabel = 'пока не ясно'
  let tone = 'Слушай и собирай факты — типаж ещё не проявился.'
  let bestHits = 0

  for (const rule of TYPE_RULES) {
    const hits = rule.cues.filter((re) => re.test(haystack)).length
    if (hits > bestHits) {
      bestHits = hits
      type = rule.type
      typeLabel = rule.label
      tone = rule.tone
    }
  }

  const predicted: PredictedObjection[] = []
  for (const p of PREDICTORS) {
    const hits = p.cues.filter((re) => re.test(haystack)).length
    if (!hits) continue
    // уже прозвучавшее возражение отрабатывает ретривер, здесь важны намёки
    const probability = Math.min(0.95, p.weight + (hits - 1) * 0.08)
    const kb = retrieveObjection(p.label)
    predicted.push({
      id: p.id,
      label: p.label,
      probability: Math.round(probability * 100) / 100,
      why: p.why,
      say: kb?.answer || p.probe,
    })
  }

  predicted.sort((a, b) => b.probability - a.probability)

  return { type, typeLabel, tone, predicted: predicted.slice(0, 3) }
}
