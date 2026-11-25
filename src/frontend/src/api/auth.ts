import { apiFetch } from '@/api/client'
import type { LoginResponse, RegisterRequest, RegistrationResponse } from '@/api/types/auth'

/** POST /auth/login (contratti, A.1). 401 credenziali sbagliate; 403 ACCOUNT_PENDING o ACCOUNT_DISABLED */
export function login(username: string, password: string) {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: { username, password } })
}

/** POST /auth/register: account in attesa; 409 DUPLICATE_USERNAME o DUPLICATE_EMAIL, 422 per i campi */
export function register(body: RegisterRequest) {
  return apiFetch<RegistrationResponse>('/auth/register', { method: 'POST', body })
}
