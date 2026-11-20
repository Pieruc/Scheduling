import type { User } from '@/api/types/auth'

/** Password di prova, uguale per tutti: vale solo con il backend finto */
export const MOCK_PASSWORD = 'demo'

/** Utenti di prova, uno per ruolo: il nome utente è il ruolo, facile da ricordare */
export const mockUsers: User[] = [
  { id: 'U-1', username: 'pianificatore', displayName: 'Giulia Neri', roles: ['PLANNER'] },
  {
    id: 'U-2',
    username: 'operatore',
    displayName: 'Marco Rossi',
    department: 'Reparto saldatura',
    roles: ['OPERATOR'],
  },
  { id: 'U-3', username: 'amministratore', displayName: 'Luca Bianchi', roles: ['ADMIN'] },
]
