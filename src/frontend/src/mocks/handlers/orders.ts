import { http, HttpResponse } from 'msw'
import type { ProblemDetails } from '@/api/types/common'
import type { Order, OrderInput, ProcessGraph } from '@/api/types/orders'
import { findCycle } from '@/lib/graph'
import { orders, processGraphs } from '@/mocks/data/orders'
import { api, latency, problem, simulatedFailure } from './utils'

/** Controlli del backend sul grafo (contratti, A.3 e B.1): cicli e riferimenti. */
function validateGraph(graph: ProcessGraph) {
  const ids = graph.activities.map((a) => a.id)
  const errors: NonNullable<ProblemDetails['errors']> = []
  graph.precedences.forEach((p, i) => {
    if (!ids.includes(p.from) || !ids.includes(p.to)) {
      errors.push({
        code: 'UNKNOWN_ACTIVITY',
        path: `precedences[${i}]`,
        message: 'Attività inesistente.',
      })
    }
  })
  const cycle = findCycle(ids, graph.precedences)
  if (cycle) {
    const names = cycle.map((id) => graph.activities.find((a) => a.id === id)?.name ?? id)
    errors.push({
      code: 'CYCLIC_PRECEDENCE',
      path: 'precedences',
      message: `Ciclo ${names.join(' → ')}`,
    })
  }
  if (!errors.length) return null
  const body: ProblemDetails = {
    type: 'https://p06.local/errors/validation',
    title: 'Validation failed',
    status: 422,
    detail: errors.map((e) => e.message).join(' · '),
    errors,
  }
  return HttpResponse.json(body, {
    status: 422,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

/** Controlli sui dati della commessa: codice unico, scadenza dopo il rilascio */
function validateOrder(input: OrderInput, isNew: boolean) {
  const errors: NonNullable<ProblemDetails['errors']> = []
  if (isNew && orders.some((o) => o.id === input.id)) {
    errors.push({ code: 'DUPLICATE_ID', path: 'id', message: `Il codice ${input.id} è già usato.` })
  }
  if (input.dueDate && Date.parse(input.dueDate) <= Date.parse(input.releaseDate)) {
    errors.push({
      code: 'DUE_BEFORE_RELEASE',
      path: 'dueDate',
      message: 'La scadenza deve venire dopo la data di rilascio.',
    })
  }
  if (!errors.length) return null
  const body: ProblemDetails = {
    type: 'https://p06.local/errors/validation',
    title: 'Validation failed',
    status: 422,
    detail: errors[0].message,
    errors,
  }
  return HttpResponse.json(body, {
    status: 422,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

export const orderHandlers = [
  http.post(api('/orders'), async ({ request }) => {
    await latency()
    const input = (await request.json()) as OrderInput
    const invalid = simulatedFailure() ?? validateOrder(input, true)
    if (invalid) return invalid
    const created: Order = { ...input, status: 'OPEN', activityCount: 0 }
    orders.unshift(created)
    processGraphs[created.id] = { activities: [], precedences: [] }
    return HttpResponse.json(created, { status: 201 })
  }),

  http.put(api('/orders/:id'), async ({ params, request }) => {
    await latency()
    const order = orders.find((o) => o.id === params.id)
    if (!order) return problem(404, 'Not Found', `Commessa ${params.id} inesistente.`)
    if (order.status !== 'OPEN') {
      return problem(409, 'Conflict', 'La commessa è già pianificata: non si può modificare.')
    }
    const input = (await request.json()) as OrderInput
    const invalid = simulatedFailure() ?? validateOrder(input, false)
    if (invalid) return invalid
    Object.assign(order, input, { id: order.id })
    return HttpResponse.json(order)
  }),

  http.delete(api('/orders/:id'), async ({ params }) => {
    await latency()
    const order = orders.find((o) => o.id === params.id)
    if (!order) return problem(404, 'Not Found', `Commessa ${params.id} inesistente.`)
    const failure = simulatedFailure()
    if (failure) return failure
    if (order.status === 'IN_PROGRESS' || order.status === 'DONE') {
      return problem(409, 'Conflict', 'La commessa è già in lavorazione: non si può annullare.')
    }
    order.status = 'CANCELLED'
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(api('/orders'), async ({ request }) => {
    await latency()
    const status = new URL(request.url).searchParams.get('status')
    const list = status ? orders.filter((o) => o.status === status) : orders
    return simulatedFailure() ?? HttpResponse.json(list)
  }),

  http.get(api('/orders/:id/process-graph'), async ({ params }) => {
    await latency()
    const graph = processGraphs[params.id as string]
    return (
      simulatedFailure() ??
      (graph
        ? HttpResponse.json(graph)
        : problem(404, 'Not Found', `Commessa ${params.id} inesistente.`))
    )
  }),

  http.put(api('/orders/:id/process-graph'), async ({ params, request }) => {
    await latency()
    const id = params.id as string
    if (!processGraphs[id]) return problem(404, 'Not Found', `Commessa ${id} inesistente.`)
    const graph = (await request.json()) as ProcessGraph
    const invalid = simulatedFailure() ?? validateGraph(graph)
    if (invalid) return invalid
    processGraphs[id] = graph
    const order = orders.find((o) => o.id === id)
    if (order) order.activityCount = graph.activities.length
    return HttpResponse.json(graph)
  }),
]
