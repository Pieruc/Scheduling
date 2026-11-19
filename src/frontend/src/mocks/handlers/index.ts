import { http, HttpResponse } from 'msw'
import { alerts } from '@/mocks/data/alerts'
import { kpiSeries } from '@/mocks/data/kpis'
import { activeModels } from '@/mocks/data/models'
import { configHandlers } from './config'
import { orderHandlers } from './orders'
import { planningHandlers } from './planning'
import { reviewHandlers } from './review'
import { api, latency, simulatedFailure } from './utils'

/**
 * Backend finto: stessi URL e stessi JSON dell'API pubblica (contratto A).
 * Quando un endpoint vero è pronto, si toglie il suo handler da qui.
 */
export const handlers = [
  ...configHandlers,
  ...orderHandlers,
  ...planningHandlers,
  ...reviewHandlers,

  http.get(api('/kpis'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(kpiSeries)
  }),

  http.get(api('/alerts'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(alerts)
  }),

  http.get(api('/models/active'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(activeModels)
  }),
]
