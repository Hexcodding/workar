/**
 * Деньги сделки из разговора.
 *
 * В карточке их нет и быть не может: цену называет Егор, а карточка слушает
 * маму. Для таблицы же нужны обе цифры — полная сумма и платёж по рассрочке,
 * поэтому берём их прямо из речи.
 *
 * Цифр в диагностике много, и почти все не про деньги: «150 тысяч
 * выпускников», «30 тысяч правил», «4,7 средний балл». Поэтому сумму
 * засчитываем только рядом со словами о цене, а из нескольких берём
 * последнюю: по ходу разговора цена меняется — скидка, другой тариф, —
 * и в чек уходит то, на чём сошлись.
 */
export type DealMoney = {
  /** сумма целиком, «119000» */
  total: string
  /** ежемесячный платёж, «4958» */
  monthly: string
}

const SUM = /(\d[\d\s.,]{2,})\s*(тысяч[а-яё]*|тыс\.?|рубл[а-яё]*|₽|р\.)/gi

/** Слева от суммы должно звучать, что речь о цене */
const PRICE_NEAR = /стоим|стоит|цен[аыу]|ценник|тариф|рассрочк|платеж|плат[её]ж|оплат|чек|скидк|обойд[её]тся|выйдет|в месяц/i

/** Справа — то, что суммой быть не может */
const NOT_MONEY = /^\s*(выпускник|ученик|учеников|человек|детей|ребят|правил|слов|семей|школ|подписчик|часов|уроков)/i

const MONTHLY_NEAR = /^\s*(в месяц|ежемесячн|в мес\.?|каждый месяц)/i

/** Срок образовательной рассрочки: по нему видно, бьётся ли сумма с платежом */
const MONTHS = 24

function normalize(digits: string, unit: string): number {
  const n = Number(digits.replace(/[^\d]/g, ''))
  if (!n) return 0
  return /тысяч|тыс/i.test(unit) && n < 1000 ? n * 1000 : n
}

export function dealMoney(text: string): DealMoney {
  const monthlyHits: number[] = []
  const totalHits: number[] = []

  for (const m of text.matchAll(SUM)) {
    const at = m.index ?? 0
    const after = text.slice(at + m[0].length, at + m[0].length + 30)
    if (NOT_MONEY.test(after)) continue

    const before = text.slice(Math.max(0, at - 80), at)
    const monthly = MONTHLY_NEAR.test(after)
    if (!monthly && !PRICE_NEAR.test(before)) continue

    const n = normalize(m[1], m[2])
    if (n < 500) continue
    if (monthly || n < 20000) monthlyHits.push(n)
    else totalHits.push(n)
  }

  const monthly = monthlyHits.at(-1) ?? 0
  // сумму берём ту, что бьётся с платежом: после скидки старая цена ещё
  // висит в разговоре, и в чек уехала бы она
  const fits = monthly
    ? totalHits.filter((n) => Math.abs(n - monthly * MONTHS) / (monthly * MONTHS) < 0.1)
    : totalHits
  const total = fits.at(-1) ?? 0

  return {
    total: total ? String(total) : '',
    monthly: monthly ? String(monthly) : '',
  }
}
