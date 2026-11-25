import { http, HttpResponse } from 'msw'
import type { ProblemDetails } from '@/api/types/common'
import type { RegisterRequest, Role, UpdateUserRequest } from '@/api/types/auth'
import { accounts, isDemo, MOCK_PASSWORD, toManaged, toUser } from '@/mocks/data/users'
import { api, latency, problem, simulatedFailure } from './utils'

/** Errore con un codice, come ApiException del backend (409, 403) o i 422 con il path */
function coded(status: number, code: string, message: string, path: string | null = null) {
  const body: ProblemDetails = {
    type: 'https://p06.local/errors',
    title: status === 422 ? 'Validation failed' : status === 409 ? 'Conflict' : 'Forbidden',
    status,
    detail: message,
    errors: [{ code, path: path ?? '', message }],
  }
  return HttpResponse.json(body, {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

/** Chi sta chiamando: il token finto è "mock-<username>" */
function caller(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer mock-/, '')
  return accounts.find((a) => a.username === token)
}

let nextId = 6

export const authHandlers = [
  /**
   * Login di prova. Utenti demo: password "demo" oppure vuota; nome utente vuoto = pianificatore.
   * Gli account registrati usano la loro password. In attesa o disattivato -> 403, come il backend.
   */
  http.post(api('/auth/login'), async ({ request }) => {
    await latency()
    const { username, password } = (await request.json()) as {
      username: string
      password: string
    }
    const name = username.trim().toLowerCase() || 'pianificatore'
    const account = accounts.find((a) => a.username.toLowerCase() === name)
    const ok =
      account &&
      (password === account.password ||
        (isDemo(account) && (password === '' || password === MOCK_PASSWORD)))
    if (!account || !ok) return problem(401, 'Unauthorized', 'Nome utente o password errati.')
    if (account.status === 'PENDING') {
      return coded(403, 'ACCOUNT_PENDING', 'L’account aspetta l’approvazione di un amministratore.')
    }
    if (account.status === 'DISABLED') {
      return coded(403, 'ACCOUNT_DISABLED', 'L’account è stato disattivato da un amministratore.')
    }
    return HttpResponse.json({
      accessToken: `mock-${account.username}`,
      expiresIn: 28_800,
      user: toUser(account),
    })
  }),

  http.post(api('/auth/register'), async ({ request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    const body = (await request.json()) as RegisterRequest
    const username = body.username.trim()
    if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
      return coded(409, 'DUPLICATE_USERNAME', `Il nome utente ${username} è già usato.`)
    }
    if (accounts.some((a) => a.email.toLowerCase() === body.email.trim().toLowerCase())) {
      return coded(409, 'DUPLICATE_EMAIL', 'Esiste già un account con questa email.')
    }
    const id = `U-${nextId++}`
    accounts.push({
      id,
      username,
      email: body.email.trim(),
      fullName: body.fullName.trim(),
      role: null,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      approvedAt: null,
      password: body.password,
    })
    return HttpResponse.json(
      {
        id,
        username,
        status: 'PENDING',
        message:
          'Registration received: an administrator must approve the account before you can log in',
      },
      { status: 201 },
    )
  }),

  http.get(api('/users'), async ({ request }) => {
    await latency()
    const failure = simulatedFailure()
    if (failure) return failure
    if (caller(request)?.role !== 'ADMIN') return problem(403, 'Forbidden', 'Solo amministratori.')
    const status = new URL(request.url).searchParams.get('status')
    const list = accounts.filter((a) => !status || a.status === status).map(toManaged)
    return HttpResponse.json(list)
  }),

  http.post(api('/users/:id/approve'), async ({ request, params }) => {
    await latency()
    const account = accounts.find((a) => a.id === params.id)
    if (!account) return problem(404, 'Not Found', `Utente ${params.id} inesistente.`)
    if (account.status !== 'PENDING') {
      return coded(409, 'NOT_PENDING', `L’utente ${account.username} non è in attesa.`)
    }
    const { role } = (await request.json()) as { role: Role }
    Object.assign(account, { role, status: 'ACTIVE', approvedAt: new Date().toISOString() })
    return HttpResponse.json(toManaged(account))
  }),

  http.patch(api('/users/:id'), async ({ request, params }) => {
    await latency()
    const account = accounts.find((a) => a.id === params.id)
    if (!account) return problem(404, 'Not Found', `Utente ${params.id} inesistente.`)
    if (account.status === 'PENDING') {
      return coded(409, 'USER_PENDING', 'Prima va approvata la registrazione.')
    }
    const body = (await request.json()) as UpdateUserRequest
    const self = caller(request)?.id === account.id
    if (self && (body.active === false || (body.role && body.role !== 'ADMIN'))) {
      return coded(
        409,
        'SELF_LOCKOUT',
        'Non puoi disattivarti né toglierti il ruolo di amministratore.',
      )
    }
    if (body.role) account.role = body.role
    if (body.active !== undefined) account.status = body.active ? 'ACTIVE' : 'DISABLED'
    return HttpResponse.json(toManaged(account))
  }),

  http.delete(api('/users/:id'), async ({ params }) => {
    await latency()
    const index = accounts.findIndex((a) => a.id === params.id)
    if (index < 0) return problem(404, 'Not Found', `Utente ${params.id} inesistente.`)
    if (accounts[index].status !== 'PENDING') {
      return coded(
        409,
        'NOT_PENDING',
        'Si rifiutano solo le registrazioni in attesa: disattiva l’utente.',
      )
    }
    accounts.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),
]
