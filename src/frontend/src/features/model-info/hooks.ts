import { useQuery } from '@tanstack/react-query'
import { getActiveModels } from '@/api/models'
import { queryKeys } from '@/api/queryKeys'

/** Modelli AI attivi: cambiano di rado, quindi restano in cache 10 minuti. */
export function useActiveModels() {
  return useQuery({
    queryKey: queryKeys.models.active,
    queryFn: ({ signal }) => getActiveModels(signal),
    staleTime: 10 * 60_000,
  })
}
