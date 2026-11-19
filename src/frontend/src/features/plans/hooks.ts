import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getPlanRequest } from '@/api/plans'
import { queryKeys } from '@/api/queryKeys'

/** Ogni quanto si richiede lo stato di una richiesta ancora in calcolo */
const POLL_MS = 1500

/**
 * Una richiesta di pianificazione. Finché è PENDING si ricarica ogni 1,5 s (polling,
 * contratti A.4); quando è completata o fallita il polling si ferma da solo.
 */
export function usePlanRequest(id: string | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.planRequests.detail(id ?? ''),
    queryFn: ({ signal }) => getPlanRequest(id!, signal),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? POLL_MS : false),
  })

  // Appena la richiesta finisce, gli elenchi (dashboard, piani) devono mostrarla aggiornata
  const status = query.data?.status
  useEffect(() => {
    if (status && status !== 'PENDING') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.planRequests.all, exact: false })
    }
  }, [status, queryClient])

  return query
}
