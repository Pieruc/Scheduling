import { http, HttpResponse } from 'msw'
import type { ProblemDetails } from '@/api/types/common'
import type { Resource, ResourceInput } from '@/api/types/config'
import { calendars, resources, skills } from '@/mocks/data/config'
import { api, latency, problem, simulatedFailure } from './utils'

/** Controlli che farebbe il backend: risposta 422 con l'errore legato al campo. */
function validate(input: ResourceInput, isNew: boolean) {
  const errors: NonNullable<ProblemDetails['errors']> = []
  if (isNew && resources.some((r) => r.id === input.id)) {
    errors.push({ code: 'DUPLICATE_ID', path: 'id', message: `Il codice ${input.id} è già usato.` })
  }
  const unknown = input.skills.filter((s) => !skills.some((k) => k.code === s))
  if (unknown.length) {
    errors.push({
      code: 'UNKNOWN_SKILL',
      path: 'skills',
      message: `Competenze inesistenti: ${unknown.join(', ')}.`,
    })
  }
  if (!calendars.some((c) => c.id === input.calendarId)) {
    errors.push({
      code: 'UNKNOWN_CALENDAR',
      path: 'calendarId',
      message: 'Calendario inesistente.',
    })
  }
  if (errors.length === 0) return null
  const body: ProblemDetails = {
    type: 'https://p06.local/errors/validation',
    title: 'Validation failed',
    status: 422,
    detail: `La risorsa contiene ${errors.length} ${errors.length === 1 ? 'errore' : 'errori'}.`,
    errors,
  }
  return HttpResponse.json(body, {
    status: 422,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

export const configHandlers = [
  http.get(api('/resources'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(resources)
  }),

  http.post(api('/resources'), async ({ request }) => {
    await latency()
    const input = (await request.json()) as ResourceInput
    const invalid = simulatedFailure() ?? validate(input, true)
    if (invalid) return invalid
    const created: Resource = { ...input, active: true }
    resources.push(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.put(api('/resources/:id'), async ({ request, params }) => {
    await latency()
    const index = resources.findIndex((r) => r.id === params.id)
    if (index < 0) return problem(404, 'Not Found', `Risorsa ${params.id} inesistente.`)
    const input = (await request.json()) as ResourceInput
    const invalid = simulatedFailure() ?? validate(input, false)
    if (invalid) return invalid
    resources[index] = { ...resources[index], ...input, id: resources[index].id }
    return HttpResponse.json(resources[index])
  }),

  http.delete(api('/resources/:id'), async ({ params }) => {
    await latency()
    const found = resources.find((r) => r.id === params.id)
    if (!found) return problem(404, 'Not Found', `Risorsa ${params.id} inesistente.`)
    const failure = simulatedFailure()
    if (failure) return failure
    found.active = false
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(api('/calendars'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(calendars)
  }),

  http.get(api('/skills'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(skills)
  }),
]
