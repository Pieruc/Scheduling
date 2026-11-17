/** Data e ora ISO-8601 con fuso, es. "2026-11-06T08:00:00+01:00" (contratti, §0) */
export type IsoDateTime = string

/** Data ISO-8601 senza ora, es. "2026-11-06" */
export type IsoDate = string

/** Errore RFC 7807 restituito dal backend (contratti, §0) */
export type ProblemDetails = {
  type?: string
  title: string
  status: number
  detail?: string
  instance?: string
  traceId?: string
  errors?: { code: string; path: string; message: string }[]
}
