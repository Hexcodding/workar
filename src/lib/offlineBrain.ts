import {
  retrieveObjection,
  retrievePhrases,
  retrieveQuestions,
  retrieveTriggers,
} from '../data/knowledgePack'
import {
  buildPointBCard,
  CTA,
  detectExcellentObjection,
  detectMomPain,
  DETACHED_TECHNIQUE,
  EXCELLENT_ANGLES,
  findMentorLine,
  interpretSubjects,
  nextVpQuestion,
  scaleFollowUp,
} from '../data/mentorPack'
import {
  guessStageFromText,
  scanPersonalAlerts,
  STAGE_HINTS,
} from '../data/playbook'
import { nextTrainStep, trainingGates } from '../data/trainingPath'
import { findSuccess } from '../store/memoryStore'
import type { BrainResult } from './brain'
import { applyEcho, buildClientEcho } from './clientEcho'
import { buildClientProfile } from './clientProfile'
import type { DialogMetrics, Utterance } from './dialogMeter'
import { computeSlipRisk } from './riskMeter'
import { compareTimeline } from './timeline'

export function runOfflineBrain(input: {
  momName: string
  childName: string
  sellerName: string
  elapsedMin: number
  checked: Record<string, boolean>
  recentText: string
  fullText: string
  metrics?: DialogMetrics
  clientText?: string
  utterances?: Utterance[]
}): BrainResult {
  const stage = guessStageFromText(input.recentText || input.fullText, input.checked)
  const hint = STAGE_HINTS.find((s) => s.stageId === stage) ?? STAGE_HINTS[0]
  const alerts = scanPersonalAlerts({
    recentText: input.recentText,
    fullText: input.fullText,
    checked: input.checked,
    elapsedMin: input.elapsedMin,
    metrics: input.metrics,
  }).slice(0, 4)

  /** Запрос для ретривера: последние реплики клиента важнее своей речи */
  const query = input.clientText?.trim() || input.recentText || input.fullText

  const talkingPrice =
    /стоим|тысяч|рассрочк|в месяц|оплат|5000|119|209|8708/.test(
      (input.recentText || '').toLowerCase(),
    )
  const gate = trainingGates({
    checked: input.checked,
    elapsedMin: input.elapsedMin,
    talkingPrice,
    metrics: input.metrics,
  })
  const train = gate.blocked ? gate.step : nextTrainStep(input.checked)

  if (gate.blocked) {
    alerts.unshift({
      id: `gate-${train.id}`,
      level: 'critical',
      title: gate.reason,
      text: train.coachFocus,
      say: train.say,
    })
  }

  const mom = input.momName || 'мама'
  const child = input.childName || 'ребёнок'

  const risk = computeSlipRisk({
    elapsedMin: input.elapsedMin,
    checked: input.checked,
    fullText: input.fullText,
    recentText: input.recentText,
    metrics: input.metrics,
  })

  if (risk.level === 'danger') {
    alerts.unshift({
      id: 'slip-risk',
      level: 'critical',
      title: `КРАСНЫЙ СВЕТ · риск слива ${risk.score}%`,
      text: `Уходит в «подумаю»: ${risk.reasons.join(', ')}. Ломай структуру и вскрывай сейчас.`,
      say: risk.say,
    })
  } else if (risk.level === 'watch') {
    alerts.push({
      id: 'slip-watch',
      level: 'warn',
      title: `Риск слива ${risk.score}%`,
      text: risk.reasons.join(', ') || 'Следи за вовлечённостью клиента.',
      say: risk.say,
    })
  }

  const objection = retrieveObjection(query)
  if (objection) {
    alerts.unshift({
      id: 'kb-objection',
      level: 'critical',
      title: `Возражение: ${objection.trigger.slice(0, 80)}`,
      text: 'Отработка из базы знаний',
      say: objection.answer,
    })
  }

  /**
   * Слой наставника идёт выше корпуса: за фразой мамы всегда стоит боль,
   * и работать надо с болью, а не с формулировкой.
   */
  const momPain = detectMomPain(query)
  if (momPain) {
    alerts.unshift({
      id: `mentor-pain-${momPain.id}`,
      level: 'warn',
      title: `За «${momPain.surface}» стоит: ${momPain.pain}`,
      text: momPain.deeper ? `${momPain.deeper} Не отвечай — углубляй.` : 'Не отвечай — углубляй.',
      say: momPain.deepen[0],
    })
  }

  // шкала: ответ меньше десяти нельзя оставлять как есть
  const scaleAsk = scaleFollowUp(input.recentText || query)
  if (scaleAsk) {
    alerts.unshift({
      id: 'mentor-scale',
      level: 'critical',
      title: 'Шкала не 10 — добери баллы',
      text: 'Пока не 10, дальше идти рано: узнай, что мешает поставить десятку.',
      say: scaleAsk,
    })
  }

  const subject = interpretSubjects(query)
  if (subject) {
    alerts.push({
      id: `mentor-subject-${subject.subject}`,
      level: 'tip',
      title: `За тройками стоит: ${subject.deficit.split(':')[0]}`,
      text: subject.deficit,
      say: subject.ask,
    })
  }

  // остывший родитель чаще всего с травмой отверженного: дожим только оттолкнёт
  const detached = Boolean(
    input.metrics?.clientAudible &&
      (input.metrics.clientCooling || risk.level === 'danger') &&
      input.elapsedMin >= 12,
  )
  if (detached) {
    alerts.unshift({
      id: DETACHED_TECHNIQUE.id,
      level: 'warn',
      title: DETACHED_TECHNIQUE.title,
      text: DETACHED_TECHNIQUE.note,
      say: DETACHED_TECHNIQUE.say,
    })
  }

  const mentorLine = findMentorLine(query)
  if (mentorLine) {
    alerts.push({
      id: `mentor-line-${mentorLine.id}`,
      level: 'tip',
      title: `Связка наставника: ${mentorLine.title}`,
      text: 'Формулировка проверена наставником — говори близко к тексту.',
      say: mentorLine.say,
    })
  }

  const excellentAngle = detectExcellentObjection(query) ? EXCELLENT_ANGLES[0] : null
  if (excellentAngle) {
    alerts.unshift({
      id: `mentor-excellent-${excellentAngle.id}`,
      level: 'critical',
      title: `«У нас отличник» · ${excellentAngle.title}`,
      text: 'Мягкий вход по разбору наставника. Дальше при сопротивлении — тихий отличник и вопрос про 25 лет.',
      say: excellentAngle.say,
    })
  }

  const stageId = train.stageId || stage
  const personal = findSuccess(query, stageId)
  if (personal) {
    alerts.unshift({
      id: `memory-${personal.id}`,
      level: 'tip',
      title: `Твоя рабочая фраза (${personal.uses}×)`,
      text: 'В похожей ситуации это уже срабатывало у тебя.',
      say: personal.say,
    })
  }

  const utterances = input.utterances ?? []
  const echo = buildClientEcho(utterances)
  const profile = buildClientProfile(utterances, input.fullText)
  const timeline = compareTimeline({
    elapsedMin: input.elapsedMin,
    checked: input.checked,
    fullText: input.fullText,
  })

  // Деньги мамы — самый сильный аргумент на цене, но только когда цена в игре
  if (echo.money && (talkingPrice || /finance|close|objections/.test(stageId))) {
    alerts.push({
      id: 'money-radar',
      level: 'tip',
      title: `Деньги-радар: ${echo.money.monthly.toLocaleString('ru-RU')} ₽/мес`,
      text: `Уже потрачено около ${echo.money.spentTotal.toLocaleString('ru-RU')} ₽. Сравнивай с этим, а не с нулём.`,
      say: echo.money.argument,
    })
  }

  // Возражение ещё не прозвучало — готовим отработку заранее
  const preArmed = profile.predicted.find((p) => p.probability >= 0.65)
  if (preArmed && !objection && risk.level !== 'danger') {
    alerts.push({
      id: `pre-${preArmed.id}`,
      level: 'tip',
      title: `Готовься: «${preArmed.label}»`,
      text: `Вероятно ${Math.round(preArmed.probability * 100)}% — ${preArmed.why}. Сними заранее.`,
      say: preArmed.say,
    })
  }

  if (timeline?.behind) {
    alerts.push({
      id: 'timeline',
      level: 'warn',
      title: `Отстаёшь от эталона: ${timeline.nextTitle}`,
      text: timeline.message,
      say: '',
    })
  }

  const kidSpeaking = Boolean(
    input.metrics?.kidPresent && utterances[utterances.length - 1]?.role === 'kid',
  )
  if (kidSpeaking) {
    alerts.unshift({
      id: 'kid-mode',
      level: 'tip',
      title: 'Говорит ребёнок',
      text: 'Переходи на «ты», короткие вопросы, без взрослых терминов. Мама слушает.',
      say: '',
    })
  }

  // вопросы задаёт Егор, поэтому пройденное по скрипту ищем только в его речи
  const sellerText =
    utterances
      .filter((u) => u.role === 'seller')
      .map((u) => u.text)
      .join(' ') || input.fullText

  // Точка Б по схеме наставника: сначала оцифруй — потом продавай
  const pointBCard = buildPointBCard(utterances, sellerText)
  if (pointBCard.next && /greeting|pains|pitch/.test(stageId)) {
    alerts.push({
      id: 'mentor-pointb',
      level: pointBCard.done >= 4 ? 'tip' : 'warn',
      title: `Точка Б оцифрована ${pointBCard.done}/${pointBCard.total}`,
      text: `Не хватает: ${pointBCard.missing.map((m) => m.title).join(', ')}.`,
      say: pointBCard.next.ask,
    })
  }

  const cta = [CTA.motivation, CTA.environment, CTA.timing].find((c) => c.when.test(query))
  if (cta) {
    alerts.push({
      id: cta.id,
      level: 'tip',
      title: `Связка наставника: ${cta.title}`,
      text: 'Призыв к действию через эмпатию, не через давление.',
      say: cta.say,
    })
  }

  const lead = alerts[0]
  // порядок вопросов ВП задан наставником, поэтому он идёт впереди базы
  const vpNext = /greeting|pains/.test(stageId)
    ? nextVpQuestion(sellerText, kidSpeaking ? 'kid' : 'parent')
    : null
  const scriptQs = retrieveQuestions(
    stageId,
    query,
    2,
    kidSpeaking ? 'kid' : 'parent',
  )
  const scriptTriggers = retrieveTriggers(stageId, query, 2)
  if (vpNext && !objection && !momPain) {
    alerts.unshift({
      id: `mentor-vp-${vpNext.order}`,
      level: 'tip',
      title: `Вопрос ВП ${vpNext.order}/22 · ${vpNext.audience === 'kid' ? 'ребёнку' : 'маме'}`,
      text: 'Порядок наставника: спрашивай по списку, не перескакивай.',
      say: vpNext.text,
    })
  } else if (scriptQs[0] && !objection) {
    alerts.unshift({
      id: 'kb-question',
      level: 'tip',
      title: scriptQs[0].block || 'Вопрос из базы',
      text: scriptQs[0].tip || 'Задай вопрос из базы Парты',
      say: scriptQs[0].text,
    })
  } else if (scriptTriggers[0] && !objection && /pitch|close|objections/.test(stageId)) {
    alerts.unshift({
      id: 'kb-trigger',
      level: 'tip',
      title: scriptTriggers[0].block || 'Заготовка из базы',
      text: scriptTriggers[0].tip || 'Сильная фраза для вставки в диалог',
      say: scriptTriggers[0].text,
    })
  }

  const retrieved = retrievePhrases(stageId, query, 3)

  const sayNext = [
    personal?.say,
    scaleAsk,
    excellentAngle?.say,
    objection?.answer,
    momPain?.deepen[0],
    mentorLine?.say,
    vpNext?.text,
    scriptQs[0]?.text,
    scriptTriggers[0]?.text,
    train.say,
    lead?.say,
    ...retrieved,
    ...hint.sayNow,
  ]
    .filter(Boolean)
    .map((s) => applyEcho(String(s), echo, mom, child))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3)

  for (const alert of alerts) {
    if (alert.say) alert.say = applyEcho(alert.say, echo, mom, child)
  }

  const priorityAction = gate.blocked
    ? `${gate.reason}. Дальше: ${train.title}`
    : lead
      ? `${lead.title}: ${lead.text}`
      : `Шаг ${train.order}/10 · ${train.title}: ${train.coachFocus}`

  const talkPart = input.metrics
    ? ` · ты ${Math.round(input.metrics.sellerShare * 100)}% речи`
    : ''
  const typePart = profile.type === 'unknown' ? '' : ` · клиент: ${profile.typeLabel}`
  const situation = `Минута ${Math.floor(input.elapsedMin)} · путь: «${train.title}»${typePart}${talkPart}`

  const pointBMatch = input.fullText.match(
    /(?:почувствую|почувствуете|хочу чтобы|хочется чтобы|главное[,\s]+чтобы)([^.!?]{8,120})/i,
  )
  const readinessMatch = /(\d{1,2})\s*из\s*10/i.exec(input.fullText)

  return {
    stage: train.stageId || stage,
    situation,
    priorityAction,
    sayNext,
    alerts: alerts.slice(0, 5),
    checkItems: [],
    // эмоция мамы — самая ценная формулировка точки Б, к ней и возвращаемся на цене
    pointB:
      pointBCard.filled.emotion ||
      pointBCard.filled.wand ||
      echo.bestPointB ||
      pointBMatch?.[1]?.trim() ||
      '',
    readiness: readinessMatch ? `${readinessMatch[1]}/10` : '',
    sellingTip: input.metrics?.sellingTip,
    risk,
    profile,
    echo,
    timeline,
    momPain,
    pointBCard,
    vpNext,
    curatorNote: lead ? `Контроль: ${lead.title}` : `Шаг обучения: ${train.title}`,
  }
}
