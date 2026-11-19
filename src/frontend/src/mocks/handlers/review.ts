import { http, HttpResponse } from 'msw'
import type { ProblemDetails } from '@/api/types/common'
import type { DecisionRequest, GanttView } from '@/api/types/plans'
import { applyChange, makespan, moveProblem, totalTardiness } from '@/lib/schedule'
import { findPlan, gantts, ganttFor, versionSummary } from '@/mocks/data/gantt'
import { api, latency, problem, simulatedFailure } from './utils'

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

export const reviewHandlers = [
  http.get(api('/plans/:id/gantt'), async ({ params }) => {
    await latency()
    const view = ganttFor(params.id as string)
    if (!view) return problem(404, 'Not Found', `Piano ${params.id} inesistente.`)
    return simulatedFailure() ?? HttpResponse.json(view)
  }),

  http.post(api('/plans/:id/decisions'), async ({ params, request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    const id = params.id as string
    const view = ganttFor(id)
    const found = findPlan(id)
    if (!view || !found) return problem(404, 'Not Found', `Piano ${id} inesistente.`)
    if (found.plan.status !== 'PROPOSED') {
      return problem(409, 'Conflict', 'Il piano non è più da valutare: è già stato deciso.')
    }
    const body = (await request.json()) as DecisionRequest

    if (body.decision === 'APPROVE') {
      found.plan.status = 'APPROVED'
      // Le altre alternative della stessa richiesta non servono più
      found.request.plans
        .filter((p) => p.id !== id && p.status === 'PROPOSED')
        .forEach((p) => (p.status = 'SUPERSEDED'))
      return HttpResponse.json({ planId: id, status: 'APPROVED' }, { status: 201 })
    }

    if (!body.reason?.trim()) {
      return invalid('Manca il motivo.', [
        {
          code: 'REASON_REQUIRED',
          path: 'reason',
          message: 'Scrivi il motivo: finisce nell’audit.',
        },
      ])
    }

    if (body.decision === 'REJECT') {
      found.plan.status = 'REJECTED'
      return HttpResponse.json({ planId: id, status: 'REJECTED' }, { status: 201 })
    }

    // MODIFY: il backend verifica di nuovo ogni modifica (precedenze e capacità)
    let bars = view.bars
    for (const [i, change] of body.changes.entries()) {
      const reason = moveProblem(view, bars, change)
      if (reason)
        return invalid(reason, [
          { code: 'INFEASIBLE_CHANGE', path: `changes[${i}]`, message: reason },
        ])
      bars = applyChange(bars, change)
    }
    const versions = [...gantts.keys()].filter((k) => k.startsWith(`${id.split('.')[0]}.`)).length
    const next: GanttView = {
      ...view,
      planId: `${id.split('.')[0]}.${versions + 1}`,
      status: 'PROPOSED',
      bars,
      manualChanges: view.manualChanges + body.changes.length,
      kpis: { ...view.kpis, makespanMin: makespan(bars) },
    }
    next.kpis.totalTardinessMin = totalTardiness(next, bars)
    gantts.set(next.planId, next)

    // La nuova versione prende il posto della vecchia nella richiesta
    found.plan.status = 'SUPERSEDED'
    const index = found.request.plans.findIndex((p) => p.id === id)
    found.request.plans.splice(index, 1, versionSummary(found.plan, next))
    if (found.request.recommendedPlanId === id) found.request.recommendedPlanId = next.planId
    return HttpResponse.json({ planId: next.planId, status: 'PROPOSED' }, { status: 201 })
  }),
]
