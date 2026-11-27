import { ApiError } from '@/api/errors'
import { session } from '@/api/session'
import type { LoginResponse } from '@/api/types/auth'
import type { ProblemDetails } from '@/api/types/common'

/** URL di base dell'API pubblica (contratto A): /api/v1 */
const BASE_URL = import.meta.env.VITE_API_URL

type Query = Record<string, string | number | boolean | undefined>

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Parametri in coda all'URL: { from: '2026-11-01' } -> ?from=2026-11-01 */
  query?: Query
  /** Corpo della richiesta, inviato come JSON */
  body?: unknown
  signal?: AbortSignal
}

/**
 * Unico punto dell'app che chiama il backend. Le pagine non usano mai fetch direttamente:
 * passano dalle funzioni in api/*.ts, che usano questa.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options, session.get()?.token ?? null)
  // Access token scaduto: si rinnova una volta e si riprova la stessa richiesta
  if (response.status === 401 && session.get()?.refreshToken && (await refresh())) {
    response = await send(path, options, session.get()?.token ?? null)
  }
  // Ancora 401 (o niente refresh token): si esce e il router riporta al login
  if (response.status === 401 && session.get()) session.set(null)
  if (!response.ok) throw new ApiError(await readProblem(response))
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Rinnovo in corso: se più chiamate ricevono 401 insieme, si rinnova una volta sola */
let refreshing: Promise<boolean> | null = null

/** POST /auth/refresh (contratti A.1): nuovo access token, e nuovo refresh token */
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const current = session.get()
    try {
      const res = await send(
        '/auth/refresh',
        { method: 'POST', body: { refreshToken: current?.refreshToken } },
        null,
      )
      if (!res.ok || !current) return false
      const tokens = (await res.json()) as LoginResponse
      session.set({
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? current.refreshToken,
        user: tokens.user ?? current.user,
      })
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

async function send(path: string, options: RequestOptions, token: string | null) {
  const { method = 'GET', query, body, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    return await fetch(BASE_URL + path + toQueryString(query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError({ status: 0, title: 'Network error' })
  }
}

function toQueryString(query?: Query): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** Legge il corpo RFC 7807; se manca, ne costruisce uno dallo status HTTP. */
async function readProblem(response: Response): Promise<ProblemDetails> {
  try {
    const data = (await response.json()) as Partial<ProblemDetails>
    return { ...data, status: response.status, title: data.title ?? response.statusText }
  } catch {
    return { status: response.status, title: response.statusText || 'Errore' }
  }
}
