import { useQuery } from '@tanstack/react-query'
import { getAudit } from '@/api/audit'
import { queryKeys } from '@/api/queryKeys'
import type { PeriodFilter } from '@/lib/period'

/** Record di audit del periodo scelto; il "da quando" si calcola al momento della richiesta */
export function useAudit(period: PeriodFilter) {
  return useQuery({
    queryKey: queryKeys.audit.list(period),
    queryFn: ({ signal }) => {
      const from =
        period === 'all'
          ? undefined
          : new Date(Date.now() - Number(period) * 86_400_000).toISOString()
      return getAudit({ from }, signal)
    },
  })
}
