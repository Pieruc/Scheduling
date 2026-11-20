import { http, HttpResponse } from 'msw'
import { MOCK_PASSWORD, mockUsers } from '@/mocks/data/users'
import { api, latency, problem } from './utils'

/** Login di prova: utente esistente e password "demo". Il token non viene controllato */
export const authHandlers = [
  http.post(api('/auth/login'), async ({ request }) => {
    await latency()
    const { username, password } = (await request.json()) as {
      username: string
      password: string
    }
    const user = mockUsers.find((u) => u.username === username.trim().toLowerCase())
    if (!user || password !== MOCK_PASSWORD) {
      return problem(401, 'Unauthorized', 'Nome utente o password errati.')
    }
    return HttpResponse.json({ accessToken: `mock-${user.username}`, expiresIn: 28_800, user })
  }),
]
