import { http, HttpResponse } from 'msw'
import type { ProblemDetails } from '@/api/types/common'
import type {
  CalendarInput,
  DomainProfileInput,
  Resource,
  ResourceInput,
  Skill,
} from '@/api/types/config'
import { calendars, domainProfiles, resources, skills, summarize } from '@/mocks/data/config'
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

function unprocessable(errors: NonNullable<ProblemDetails['errors']>) {
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

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Stesse regole del form: turni in ordine, senza sovrapposizioni, almeno un giorno */
function validateCalendar(input: CalendarInput) {
  const errors: NonNullable<ProblemDetails['errors']> = []
  if (input.workDays.length === 0) {
    errors.push({ code: 'NO_WORKDAYS', path: 'workDays', message: 'Scegli almeno un giorno.' })
  }
  const sorted = [...input.shifts].sort((a, b) => minutes(a.start) - minutes(b.start))
  sorted.forEach((sh, i) => {
    if (
      minutes(sh.end) <= minutes(sh.start) ||
      (i > 0 && minutes(sh.start) < minutes(sorted[i - 1].end))
    ) {
      errors.push({
        code: 'INVALID_SHIFT',
        path: `shifts[${i}].end`,
        message: 'Turni sovrapposti o non validi.',
      })
    }
  })
  return errors.length ? unprocessable(errors) : null
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

  http.post(api('/calendars'), async ({ request }) => {
    await latency()
    const input = (await request.json()) as CalendarInput
    const invalid = simulatedFailure() ?? validateCalendar(input)
    if (invalid) return invalid
    // Come nel backend vero, il codice lo assegna il server
    const created = { ...input, id: `CAL-${calendars.length + 1}`, shiftsSummary: summarize(input) }
    calendars.push(created)
    return HttpResponse.json(created, { status: 201 })
  }),

  http.put(api('/calendars/:id'), async ({ request, params }) => {
    await latency()
    const index = calendars.findIndex((c) => c.id === params.id)
    if (index < 0) return problem(404, 'Not Found', `Calendario ${params.id} inesistente.`)
    const input = (await request.json()) as CalendarInput
    const invalid = simulatedFailure() ?? validateCalendar(input)
    if (invalid) return invalid
    calendars[index] = { ...input, id: calendars[index].id, shiftsSummary: summarize(input) }
    return HttpResponse.json(calendars[index])
  }),

  http.get(api('/skills'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(skills)
  }),

  http.post(api('/skills'), async ({ request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    const input = (await request.json()) as Skill
    if (skills.some((k) => k.code === input.code)) {
      return unprocessable([
        { code: 'DUPLICATE_CODE', path: 'code', message: `Il codice ${input.code} esiste già.` },
      ])
    }
    skills.push(input)
    return HttpResponse.json(input, { status: 201 })
  }),

  http.get(api('/domain-profiles'), async () => {
    await latency()
    return simulatedFailure() ?? HttpResponse.json(domainProfiles)
  }),

  http.put(api('/domain-profiles/:code'), async ({ request, params }) => {
    await latency()
    const found = domainProfiles.find((p) => p.code === params.code)
    if (!found) return problem(404, 'Not Found', `Profilo ${params.code} inesistente.`)
    const failure = simulatedFailure()
    if (failure) return failure
    const input = (await request.json()) as DomainProfileInput
    const w = input.defaultObjectiveWeights
    if (Math.abs(w.makespan + w.weightedTardiness + w.setup - 1) > 0.001) {
      return unprocessable([
        {
          code: 'WEIGHTS_SUM',
          path: 'defaultObjectiveWeights',
          message: 'I pesi devono sommare a 1.',
        },
      ])
    }
    Object.assign(found, input)
    return HttpResponse.json(found)
  }),
]
