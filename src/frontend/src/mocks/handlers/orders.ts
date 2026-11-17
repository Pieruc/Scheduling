import { http, HttpResponse } from 'msw'
import type { ProblemDetails } from '@/api/types/common'
import type { ProcessGraph } from '@/api/types/orders'
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

export const orderHandlers = [
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
