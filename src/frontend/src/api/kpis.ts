import { apiFetch } from '@/api/client'
import type { IsoDate } from '@/api/types/common'
import type { KpiSeries } from '@/api/types/kpis'

/** GET /kpis?from=&to= (contratti, A.6) */
export function getKpis(params: { from: IsoDate; to: IsoDate }, signal?: AbortSignal) {
  return apiFetch<KpiSeries>('/kpis', { query: params, signal })
}
