/**
 * Личная память копайлота: фразы Егора, которые реально сработали на звонке.
 * Свои удачные отработки всегда важнее корпуса — их и предлагаем первыми.
 */

import { bm25Score, buildBm25Index, expandQuery, tokenizeRu } from '../lib/ruText'

const MEMORY_KEY = 'workar.memory.v1'
const LIMIT = 120

export type SuccessPattern = {
  id: string
  trigger: string
  say: string
  stage: string
  uses: number
  createdAt: string
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function loadMemory(): SuccessPattern[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SuccessPattern[]) : []
  } catch {
    return []
  }
}

function save(list: SuccessPattern[]) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(list.slice(-LIMIT)))
  } catch {
    // переполнение localStorage не должно ронять звонок
  }
}

export function rememberSuccess(input: {
  trigger: string
  say: string
  stage: string
}): SuccessPattern[] {
  const say = input.say.trim()
  if (say.length < 10) return loadMemory()

  const list = loadMemory()
  const sameKey = say.slice(0, 60).toLowerCase()
  const existing = list.find((p) => p.say.slice(0, 60).toLowerCase() === sameKey)

  if (existing) {
    existing.uses += 1
    if (input.trigger.trim() && existing.trigger.length < 200) {
      existing.trigger = `${existing.trigger} ${input.trigger}`.trim().slice(0, 240)
    }
    save(list)
    return list
  }

  const next = [
    ...list,
    {
      id: uid(),
      trigger: input.trigger.trim().slice(0, 240),
      say,
      stage: input.stage,
      uses: 1,
      createdAt: new Date().toISOString(),
    },
  ]
  save(next)
  return next
}

export function forgetPattern(id: string): SuccessPattern[] {
  const next = loadMemory().filter((p) => p.id !== id)
  save(next)
  return next
}

/** Похожая ситуация из прошлых звонков */
export function findSuccess(query: string, stageId?: string): SuccessPattern | null {
  const list = loadMemory()
  if (!list.length) return null

  const docs = list.map((p) => {
    const tokens = tokenizeRu(`${p.trigger} ${p.say}`)
    return { tokens, length: tokens.length || 1 }
  })
  const index = buildBm25Index(docs)
  const q = expandQuery(query)
  if (!q.length) return null

  let best: { item: SuccessPattern; score: number } | null = null
  list.forEach((item, i) => {
    const stageBonus = stageId && item.stage === stageId ? 1.4 : 1
    const usesBonus = 1 + Math.min(item.uses, 5) / 10
    const score = bm25Score(q, docs[i], index) * stageBonus * usesBonus
    if (!best || score > best.score) best = { item, score }
  })

  const hit = best as { item: SuccessPattern; score: number } | null
  return hit && hit.score >= 2.5 ? hit.item : null
}
