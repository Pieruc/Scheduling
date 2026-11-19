import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPlanGantt, postDecision } from '@/api/plans'
import { queryKeys } from '@/api/queryKeys'
import type { DecisionRequest } from '@/api/types/plans'

export function usePlanGantt(planId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plans.gantt(planId ?? ''),
    queryFn: ({ signal }) => getPlanGantt(planId!, signal),
    enabled: Boolean(planId),
  })
}

/** Approva, rifiuta o modifica; poi ricarica il piano e tutti gli elenchi delle richieste. */
export function useDecision(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: DecisionRequest) => postDecision(planId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.gantt(planId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.planRequests.all }),
      ]),
  })
}
