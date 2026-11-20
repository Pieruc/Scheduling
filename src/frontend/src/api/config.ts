import { apiFetch } from '@/api/client'
import type {
  Calendar,
  CalendarInput,
  DomainProfile,
  DomainProfileInput,
  Resource,
  ResourceInput,
  Skill,
} from '@/api/types/config'

/**
 * Il backend può non restituire ancora i campi proposti in §8 (costPerHour, unavailability):
 * qui li completiamo con valori di ripiego, così le pagine non devono preoccuparsene.
 */
function normalizeResource(r: Partial<Resource> & Pick<Resource, 'id' | 'name'>): Resource {
  return {
    type: 'MACHINE',
    capacity: 1,
    skills: [],
    calendarId: '',
    active: true,
    ...r,
    costPerHour: r.costPerHour ?? null,
    unavailability: r.unavailability ?? [],
  }
}

/** GET /resources (contratti, A.2) */
export async function getResources(signal?: AbortSignal) {
  const list = await apiFetch<Resource[]>('/resources', { signal })
  return list.map(normalizeResource)
}

/** POST /resources: nuova risorsa (solo ADMIN) */
export async function createResource(input: ResourceInput) {
  return normalizeResource(await apiFetch<Resource>('/resources', { method: 'POST', body: input }))
}

/** PUT /resources/{id}: modifica (solo ADMIN) */
export async function updateResource(input: ResourceInput) {
  const saved = await apiFetch<Resource>(`/resources/${encodeURIComponent(input.id)}`, {
    method: 'PUT',
    body: input,
  })
  return normalizeResource(saved)
}

/** DELETE /resources/{id}: disattiva, non cancella (contratti, A.2) */
export function deactivateResource(id: string) {
  return apiFetch<void>(`/resources/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Come per le risorse: completa i campi proposti in §8 se il backend non li manda ancora */
function normalizeCalendar(c: Partial<Calendar> & Pick<Calendar, 'id' | 'name'>): Calendar {
  return {
    shiftsSummary: '',
    ...c,
    workDays: c.workDays ?? [],
    shifts: c.shifts ?? [],
    holidays: c.holidays ?? [],
  }
}

/** GET /calendars */
export async function getCalendars(signal?: AbortSignal) {
  return (await apiFetch<Calendar[]>('/calendars', { signal })).map(normalizeCalendar)
}

/** POST /calendars (solo ADMIN) */
export async function createCalendar(input: CalendarInput) {
  return normalizeCalendar(await apiFetch<Calendar>('/calendars', { method: 'POST', body: input }))
}

/** PROPOSTA §8: PUT /calendars/{id} (il contratto prevede solo GET e POST) */
export async function updateCalendar(input: CalendarInput) {
  const saved = await apiFetch<Calendar>(`/calendars/${encodeURIComponent(input.id)}`, {
    method: 'PUT',
    body: input,
  })
  return normalizeCalendar(saved)
}

/** GET /skills */
export function getSkills(signal?: AbortSignal) {
  return apiFetch<Skill[]>('/skills', { signal })
}

/** POST /skills (solo ADMIN). Il contratto non prevede modifica né cancellazione */
export function createSkill(skill: Skill) {
  return apiFetch<Skill>('/skills', { method: 'POST', body: skill })
}

/** GET /domain-profiles */
export function getDomainProfiles(signal?: AbortSignal) {
  return apiFetch<DomainProfile[]>('/domain-profiles', { signal })
}

/** PUT /domain-profiles/{code} (solo ADMIN): pesi di default e vincoli attivi */
export function updateDomainProfile(code: string, input: DomainProfileInput) {
  return apiFetch<DomainProfile>(`/domain-profiles/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: input,
  })
}
