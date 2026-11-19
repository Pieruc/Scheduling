import { http, HttpResponse } from 'msw'
import type { ProblemDetails } from '@/api/types/common'
import type {
  CreatePlanRequest,
  Interpretation,
  MissingDataQuestion,
  PlanRequest,
  PlanRequestStage,
} from '@/api/types/plans'
import { formatRange, formatShortDate } from '@/lib/format'
import { resources } from '@/mocks/data/config'
import { orders } from '@/mocks/data/orders'
import { planRequests } from '@/mocks/data/planRequests'
import { daysAgo } from '@/mocks/data/time'
import { api, latency, problem, simulatedFailure } from './utils'

/** 422 con gli errori legati ai campi, come il backend vero */
function invalid(detail: string, errors: NonNullable<ProblemDetails['errors']>) {
  const body: ProblemDetails = {
    type: 'https://p06.local/errors/validation',
    title: 'Validation failed',
    status: 422,
    detail,
    errors,
  }
  return HttpResponse.json(body, {
    status: 422,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

/** Finto LLM: legge codici commessa e parole chiave dal testo. */
function interpret(text: string): Interpretation {
  const mentioned = [...new Set(text.toUpperCase().match(/C-\d{3}/g) ?? [])]
  const open = orders.filter((o) => o.status === 'OPEN').map((o) => o.id)
  const orderIds = mentioned.filter((id) => orders.some((o) => o.id === id))
  const selected = orderIds.length ? orderIds : open

  const horizonStart = daysAgo(-1, 8)
  const horizonEnd = daysAgo(-7, 17)
  const avoidOvertime = /straordinar/i.test(text)

  const hardConstraints = [
    ...orders
      .filter((o) => selected.includes(o.id) && o.dueDate)
      .map((o) => `${o.id} entro ${formatShortDate(o.dueDate!)}`),
    ...resources.flatMap((r) =>
      r.unavailability
        .filter((u) => u.to > horizonStart && u.from < horizonEnd)
        .map((u) => `${r.name}: ${u.reason.toLowerCase()} ${formatRange(u.from, u.to)}`),
    ),
  ]

  const missingData: MissingDataQuestion[] = orders
    .filter((o) => selected.includes(o.id) && !o.dueDate)
    .map((o) => ({
      id: `due-${o.id}`,
      kind: 'DUE_DATE',
      orderId: o.id,
      question: `${o.id} (${o.customer}) non ha una scadenza. Quando va consegnata?`,
    }))
  if (selected.includes('C-103')) {
    missingData.push({
      id: 'welding-C-103',
      kind: 'CHOICE',
      question: 'Per la saldatura di C-103 quale postazione si può usare?',
      options: [
        { value: 'R-SAL-01,R-SAL-02', label: 'Saldatrice S1 o S2' },
        { value: 'R-SAL-01', label: 'Solo S1 (pezzo grande)' },
      ],
    })
  }

  return {
    horizonStart,
    horizonEnd,
    orderIds: selected,
    hardConstraints,
    preferences: avoidOvertime ? ['Evitare gli straordinari'] : [],
    weights: { punctuality: 8, overtime: avoidOvertime ? 7 : 4, setup: 4 },
    weightNotes: avoidOvertime
      ? ['“Evitare straordinari” è salito a 7 perché lo hai scritto nella richiesta.']
      : [],
    missingData,
  }
}

/** Fasi simulate: la richiesta avanza con il tempo dall'istante in cui è stata creata. */
const STAGES: [number, PlanRequestStage][] = [
  [1200, 'VALIDATION'],
  [2600, 'CONTEXT'],
  [4200, 'POLICY'],
  [5200, 'BASELINES'],
]
const startedAt = new Map<string, number>()

function advance(request: PlanRequest) {
  const started = startedAt.get(request.id)
  if (request.status !== 'PENDING' || started === undefined) return
  const elapsed = Date.now() - started
  const stage = STAGES.find(([until]) => elapsed < until)
  if (stage) {
    request.stage = stage[1]
    return
  }
  // Completata: tre piani come quelli dell'esempio, con id nuovi
  const template = planRequests.find((r) => r.id === 'REQ-0012')!
  const n = planRequests.length
  request.status = 'COMPLETED'
  request.stage = undefined
  request.elapsedSeconds = Math.round(elapsed / 100) / 10
  request.plans = template.plans.map((p, i) => ({
    ...p,
    id: `PLAN-${String(100 + n * 3 + i).padStart(4, '0')}`,
    createdAt: new Date().toISOString(),
  }))
  request.recommendedPlanId = request.plans[1].id
  request.baselines = template.baselines
}

export const planningHandlers = [
  http.post(api('/plan-requests/interpret'), async ({ request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    const { text } = (await request.json()) as { text: string }
    if (!text || text.trim().length < 10) {
      return invalid('La richiesta è troppo corta.', [
        { code: 'TEXT_TOO_SHORT', path: 'text', message: 'Scrivi cosa vuoi pianificare.' },
      ])
    }
    return HttpResponse.json(interpret(text))
  }),

  http.post(api('/plan-requests'), async ({ request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    const body = (await request.json()) as CreatePlanRequest
    const errors: NonNullable<ProblemDetails['errors']> = []
    if (!body.orderIds.length) {
      errors.push({ code: 'NO_ORDERS', path: 'orderIds', message: 'Scegli almeno una commessa.' })
    }
    for (const q of interpret(body.text).missingData) {
      if (!body.answers[q.id] && body.orderIds.some((id) => q.id.endsWith(id))) {
        errors.push({
          code: 'MISSING_ANSWER',
          path: `answers.${q.id}`,
          message: 'Rispondi a questa domanda.',
        })
      }
    }
    if (errors.length) return invalid('Mancano alcuni dati per pianificare.', errors)

    // Le scadenze date in risposta vengono salvate sulle commesse
    for (const [id, value] of Object.entries(body.answers)) {
      const order = id.startsWith('due-') ? orders.find((o) => `due-${o.id}` === id) : undefined
      if (order) order.dueDate = value
    }

    const id = `REQ-${String(planRequests.length + 8).padStart(4, '0')}`
    const created: PlanRequest = {
      id,
      status: 'PENDING',
      stage: 'VALIDATION',
      createdAt: new Date().toISOString(),
      createdBy: 'gneri',
      label: `Commesse ${body.orderIds.join(', ')}`,
      orderIds: body.orderIds,
      horizonStart: body.horizonStart,
      horizonEnd: body.horizonEnd,
      weights: body.weights,
      plans: [],
    }
    planRequests.unshift(created)
    startedAt.set(id, Date.now())
    return HttpResponse.json(
      { id, status: 'PENDING' },
      { status: 202, headers: { Location: api(`/plan-requests/${id}`) } },
    )
  }),

  http.get(api('/plan-requests/:id'), async ({ params }) => {
    await latency()
    const found = planRequests.find((r) => r.id === params.id)
    if (!found) return problem(404, 'Not Found', `Richiesta ${params.id} inesistente.`)
    advance(found)
    return simulatedFailure() ?? HttpResponse.json(found)
  }),

  http.get(api('/plan-requests'), async ({ request }) => {
    await latency()
    planRequests.forEach(advance)
    const limit = Number(new URL(request.url).searchParams.get('limit')) || planRequests.length
    return simulatedFailure() ?? HttpResponse.json(planRequests.slice(0, limit))
  }),
]
