import { useQuery } from '@tanstack/react-query'
import { getAlerts } from '@/api/alerts'
import { getKpis } from '@/api/kpis'
import { getPlanRequests } from '@/api/plans'
import { queryKeys } from '@/api/queryKeys'

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

/** Ultime sei settimane fino a oggi, calcolate quando il modulo viene caricato. */
const LAST_SIX_WEEKS = (() => {
  const to = new Date()
  const from = new Date(to.getTime() - 42 * 86_400_000)
  return { from: isoDate(from), to: isoDate(to) }
})()

/** KPI delle ultime sei settimane (l'ultimo punto è la settimana in corso). */
export function useKpis() {
  const range = LAST_SIX_WEEKS
  return useQuery({
    queryKey: queryKeys.kpis.range(range.from, range.to),
    queryFn: ({ signal }) => getKpis(range, signal),
  })
}

export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts.all,
    queryFn: ({ signal }) => getAlerts(signal),
  })
}

export function useRecentPlanRequests(limit = 4) {
  return useQuery({
    queryKey: queryKeys.planRequests.list(limit),
    queryFn: ({ signal }) => getPlanRequests({ limit }, signal),
  })
}
