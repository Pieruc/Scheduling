import { http, HttpResponse } from 'msw'
import { alerts } from '@/mocks/data/alerts'
import { kpiSeries } from '@/mocks/data/kpis'
import { activeModels } from '@/mocks/data/models'
import { planRequests } from '@/mocks/data/planRequests'
import { configHandlers } from './config'
import { orderHandlers } from './orders'
import { api, latency, problem, simulatedFailure } from './utils'

/**
 * Backend finto: stessi URL e stessi JSON dell'API pubblica (contratto A).
 * Quando un endpoint vero è pronto, si toglie il suo handler da qui.
 */
export const handlers = [
  ...configHandlers,
  ...orderHandlers,

  http.get(api('/kpis'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(kpiSeries)
  }),

  http.get(api('/alerts'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(alerts)
  }),

  http.get(api('/plan-requests'), async ({ request }) => {
    await latency()
    const limit = Number(new URL(request.url).searchParams.get('limit')) || planRequests.length
    return simulatedFailure() ?? HttpResponse.json(planRequests.slice(0, limit))
  }),

  http.get(api('/plan-requests/:id'), async ({ params }) => {
    await latency()
    const found = planRequests.find((r) => r.id === params.id)
    return (
      simulatedFailure() ??
      (found
        ? HttpResponse.json(found)
        : problem(404, 'Not Found', `Richiesta ${params.id} inesistente.`))
    )
  }),

  http.get(api('/models/active'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(activeModels)
  }),
]
