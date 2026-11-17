import type { ProblemDetails } from '@/api/types/common'

/**
 * Errore restituito da qualunque chiamata al backend.
 * Il backend risponde con RFC 7807 (application/problem+json): status, title, detail ed
 * eventuali errori per campo. Se la risposta non è in quel formato (rete giù, proxy, ...)
 * i campi vengono riempiti con valori di ripiego.
 */
export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail?: string
  readonly errors: NonNullable<ProblemDetails['errors']>

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.status = problem.status
    this.title = problem.title
    this.detail = problem.detail
    this.errors = problem.errors ?? []
  }

  /** Nessuna risposta dal server (offline, server spento, CORS). */
  get isNetworkError() {
    return this.status === 0
  }
}

/** Messaggio da mostrare all'utente, in italiano, per ogni tipo di errore. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Si è verificato un errore imprevisto.'
  if (error.isNetworkError) return 'Il server non risponde. Controlla la connessione e riprova.'
  switch (error.status) {
    case 401:
      return 'La sessione è scaduta: accedi di nuovo.'
    case 403:
      return 'Non hai i permessi per questa operazione.'
    case 404:
      return 'Elemento non trovato.'
    case 409:
      return 'I dati sono cambiati nel frattempo: ricarica la pagina.'
    case 422:
      return error.detail ?? 'Alcuni dati non sono validi.'
    case 503:
      return 'Il servizio non è disponibile in questo momento. Riprova tra poco.'
    default:
      return error.detail ?? error.title
  }
}
