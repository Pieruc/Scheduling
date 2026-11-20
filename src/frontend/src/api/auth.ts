import { apiFetch } from '@/api/client'
import type { LoginResponse } from '@/api/types/auth'

/** POST /auth/login (contratti, A.1). 401 se le credenziali sono sbagliate */
export function login(username: string, password: string) {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: { username, password } })
}
