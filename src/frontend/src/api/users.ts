import { apiFetch } from '@/api/client'
import type { AccountStatus, ManagedUser, Role, UpdateUserRequest } from '@/api/types/auth'

/** GET /users?status= (solo ADMIN) */
export function getUsers(status?: AccountStatus, signal?: AbortSignal) {
  return apiFetch<ManagedUser[]>('/users', { query: { status }, signal })
}

/** POST /users/{id}/approve: approva una registrazione con il ruolo scelto; 409 NOT_PENDING */
export function approveUser(id: string, role: Role) {
  return apiFetch<ManagedUser>(`/users/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: { role },
  })
}

/** PATCH /users/{id}: cambia ruolo e/o attiva/disattiva; 409 SELF_LOCKOUT o USER_PENDING */
export function updateUser(id: string, body: UpdateUserRequest) {
  return apiFetch<ManagedUser>(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body })
}

/** DELETE /users/{id}: rifiuta una registrazione in attesa; 409 NOT_PENDING per gli utenti approvati */
export function rejectRegistration(id: string) {
  return apiFetch<void>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
