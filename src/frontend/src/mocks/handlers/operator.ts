import { http, HttpResponse } from 'msw'
import type { ExecutionRequest, IncidentKind, IncidentRequest } from '@/api/types/execution'
import { alerts } from '@/mocks/data/alerts'
import { operatorDay } from '@/mocks/data/operator'
import { toIsoWithOffset } from '@/mocks/data/time'
import { api, latency, problem, simulatedFailure } from './utils'

const INCIDENT_TITLE: Record<IncidentKind, string> = {
  BREAKDOWN: 'Guasto segnalato',
  MISSING_MATERIAL: 'Materiale mancante',
  DELAY: 'Ritardo segnalato',
  OTHER: 'Segnalazione',
}

const minutesBetween = (fromIso: string, to: Date) =>
  Math.max(0, Math.round((to.getTime() - Date.parse(fromIso)) / 60_000))

let nextIncident = 32

export const operatorHandlers = [
  http.get(api('/operator/today'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(operatorDay)
  }),

  // Le stesse regole che applicherà il backend: un'attività alla volta, precedenze rispettate
  http.post(api('/executions'), async ({ request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    const body = (await request.json()) as ExecutionRequest
    const activity = operatorDay.activities.find(
      (a) => a.planId === body.planId && a.activityId === body.activityId,
    )
    if (!activity) return problem(404, 'Not Found', `Attività ${body.activityId} non trovata.`)

    const at = new Date(body.timestamp)
    const running = operatorDay.activities.find((a) => a.state === 'IN_PROGRESS' && a !== activity)
    const busy = () =>
      problem(
        409,
        'Conflict',
        `Hai già in corso ${running!.orderId} · ${running!.activityName}: mettila in pausa o terminala.`,
      )

    switch (body.event) {
      case 'START':
        if (activity.state !== 'TODO') return problem(409, 'Conflict', 'Attività già iniziata.')
        if (activity.waitingFor) {
          return problem(
            409,
            'Conflict',
            `Non si può iniziare: ${activity.waitingFor.activityName} non è ancora finita.`,
          )
        }
        if (running) return busy()
        activity.state = 'IN_PROGRESS'
        activity.actualStart = body.timestamp
        activity.runningSince = body.timestamp
        break
      case 'PAUSE':
        if (activity.state !== 'IN_PROGRESS')
          return problem(409, 'Conflict', 'Attività non in corso.')
        activity.workedMin += minutesBetween(activity.runningSince!, at)
        activity.runningSince = null
        activity.state = 'PAUSED'
        break
      case 'RESUME':
        if (activity.state !== 'PAUSED') return problem(409, 'Conflict', 'Attività non in pausa.')
        if (running) return busy()
        activity.state = 'IN_PROGRESS'
        activity.runningSince = body.timestamp
        break
      case 'END':
        if (activity.state !== 'IN_PROGRESS' && activity.state !== 'PAUSED') {
          return problem(409, 'Conflict', 'Attività non iniziata o già terminata.')
        }
        if (activity.runningSince) {
          activity.workedMin += minutesBetween(activity.runningSince, at)
        }
        activity.runningSince = null
        activity.state = 'DONE'
        activity.actualEnd = body.timestamp
        break
    }
    return HttpResponse.json(activity, { status: 201 })
  }),

  // La segnalazione diventa un avviso nella dashboard del pianificatore
  http.post(api('/incidents'), async ({ request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    const body = (await request.json()) as IncidentRequest
    if (body.kind === 'OTHER' && !body.note?.trim()) {
      return problem(422, 'Unprocessable Entity', 'Descrivi il problema.')
    }
    const resource = operatorDay.resources.find((r) => r.id === body.resourceId)
    const id = `AL-${nextIncident++}`
    alerts.unshift({
      id,
      type: 'INCIDENT',
      title: `${INCIDENT_TITLE[body.kind]} da M. Rossi`,
      detail: [resource?.name, body.note?.trim()].filter(Boolean).join(' · ') || 'Nessun dettaglio',
      createdAt: toIsoWithOffset(new Date(body.timestamp)),
      link: body.planId ? { label: 'Ripianifica', planId: body.planId } : undefined,
    })
    return HttpResponse.json({ id }, { status: 201 })
  }),
]
