import type { PlanRequest } from '@/api/types/plans'

/** Filtro per stato: si applica alla richiesta, guardando i suoi piani */
export type StatusFilter = 'all' | 'TO_REVIEW' | 'APPROVED' | 'REJECTED' | 'PENDING' | 'FAILED'

/** Periodo in giorni, oppure tutto lo storico */
export type PeriodFilter = '7' | '30' | '90' | 'all'

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tutti gli stati' },
  { value: 'TO_REVIEW', label: 'Da valutare' },
  { value: 'APPROVED', label: 'Approvati' },
  { value: 'REJECTED', label: 'Rifiutati' },
  { value: 'PENDING', label: 'In elaborazione' },
  { value: 'FAILED', label: 'Falliti' },
]

export const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: '7', label: 'Ultimi 7 giorni' },
  { value: '30', label: 'Ultimi 30 giorni' },
  { value: '90', label: 'Ultimi 90 giorni' },
  { value: 'all', label: 'Tutto lo storico' },
]

export const DEFAULT_PERIOD: PeriodFilter = '30'

export type Filters = { q: string; status: StatusFilter; period: PeriodFilter }

/** Legge i filtri dall'indirizzo (?q=…&stato=…&periodo=…), scartando i valori sconosciuti */
export function readFilters(params: URLSearchParams): Filters {
  const status = params.get('stato') as StatusFilter | null
  const period = params.get('periodo') as PeriodFilter | null
  return {
    q: params.get('q') ?? '',
    status: STATUS_OPTIONS.some((o) => o.value === status) ? status! : 'all',
    period: PERIOD_OPTIONS.some((o) => o.value === period) ? period! : DEFAULT_PERIOD,
  }
}

function matchesStatus(r: PlanRequest, status: StatusFilter): boolean {
  switch (status) {
    case 'all':
      return true
    case 'PENDING':
    case 'FAILED':
      return r.status === status
    case 'TO_REVIEW':
      return r.plans.some((p) => p.status === 'PROPOSED')
    case 'APPROVED':
      return r.plans.some((p) => p.status === 'APPROVED')
    case 'REJECTED':
      return r.plans.some((p) => p.status === 'REJECTED')
  }
}

/** Cerca nel codice e nel nome della richiesta, nelle commesse e nei codici dei piani */
function matchesQuery(r: PlanRequest, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [r.id, r.label, ...r.orderIds, ...r.plans.map((p) => p.id)].some((text) =>
    text.toLowerCase().includes(needle),
  )
}

/**
 * Filtra l'elenco nel browser. Con molte richieste conviene farlo fare al backend
 * (PROPOSTA §8: parametri q, status, from su GET /plan-requests).
 */
export function applyFilters(requests: PlanRequest[], f: Filters, now: number): PlanRequest[] {
  const from = f.period === 'all' ? -Infinity : now - Number(f.period) * 86_400_000
  return requests.filter(
    (r) => Date.parse(r.createdAt) >= from && matchesStatus(r, f.status) && matchesQuery(r, f.q),
  )
}
