import { apiFetch } from '@/api/client'
import type { Calendar, Resource, ResourceInput, Skill } from '@/api/types/config'

/** GET /resources (contratti, A.2) */
export function getResources(signal?: AbortSignal) {
  return apiFetch<Resource[]>('/resources', { signal })
}

/** POST /resources: nuova risorsa (solo ADMIN) */
export function createResource(input: ResourceInput) {
  return apiFetch<Resource>('/resources', { method: 'POST', body: input })
}

/** PUT /resources/{id}: modifica (solo ADMIN) */
export function updateResource(input: ResourceInput) {
  return apiFetch<Resource>(`/resources/${encodeURIComponent(input.id)}`, {
    method: 'PUT',
    body: input,
  })
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
