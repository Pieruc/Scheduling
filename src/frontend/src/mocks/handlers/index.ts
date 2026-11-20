import { http, HttpResponse } from 'msw'
import { alerts } from '@/mocks/data/alerts'
import { auditRecords } from '@/mocks/data/audit'
import { kpiSeries } from '@/mocks/data/kpis'
import { activeModels, modelsStatus, modelVersions } from '@/mocks/data/models'
import { authHandlers } from './auth'
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
  // Login di prova
  ...authHandlers,
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

  // GET /audit?planId=&from=&to= (contratti A.8)
  http.get(api('/audit'), async ({ request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    const q = new URL(request.url).searchParams
    const from = q.get('from') ? Date.parse(q.get('from')!) : -Infinity
    const to = q.get('to') ? Date.parse(q.get('to')!) : Infinity
    const planId = q.get('planId')
    return HttpResponse.json(
      auditRecords.filter((r) => {
        const t = Date.parse(r.timestamp)
        return t >= from && t <= to && (!planId || r.planId === planId)
      }),
    )
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
