import { apiFetch } from '@/api/client'
import type { IsoDateTime } from '@/api/types/common'
import type { KpiSeries } from '@/api/types/kpis'

/** GET /kpis?from=&to= (contratti, A.6). Il backend vuole data e ora ISO, non solo la data */
export function getKpis(params: { from: IsoDateTime; to: IsoDateTime }, signal?: AbortSignal) {
  return apiFetch<KpiSeries>('/kpis', { query: params, signal })
}
