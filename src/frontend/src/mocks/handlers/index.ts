import { http, HttpResponse } from 'msw'
import { alerts } from '@/mocks/data/alerts'
import { kpiSeries } from '@/mocks/data/kpis'
import { activeModels, modelsStatus, modelVersions } from '@/mocks/data/models'
import { configHandlers } from './config'
import { operatorHandlers } from './operator'
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
  ...operatorHandlers,

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

  http.get(api('/models/status'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(modelsStatus)
  }),

  http.get(api('/models'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(modelVersions)
  }),
]
