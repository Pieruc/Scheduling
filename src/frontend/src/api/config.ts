import { apiFetch } from '@/api/client'
import type { Calendar, Resource, ResourceInput, Skill } from '@/api/types/config'

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

/** GET /calendars */
export function getCalendars(signal?: AbortSignal) {
  return apiFetch<Calendar[]>('/calendars', { signal })
}

/** GET /skills */
export function getSkills(signal?: AbortSignal) {
  return apiFetch<Skill[]>('/skills', { signal })
}
