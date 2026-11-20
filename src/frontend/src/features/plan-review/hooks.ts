import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPlanGantt, postDecision, reschedulePlan } from '@/api/plans'
import { queryKeys } from '@/api/queryKeys'
import type { DecisionRequest, RescheduleRequest } from '@/api/types/plans'

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
        // Tutti i Gantt: approvare può scartare altri piani (anche quello ripianificato)
        queryClient.invalidateQueries({ queryKey: queryKeys.plans.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.planRequests.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit.all }),
      ]),
  })
}

/** Avvia la ripianificazione; aggiorna elenco richieste, avvisi (quello gestito sparisce) e audit */
export function useReschedule(planId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: RescheduleRequest) => reschedulePlan(planId, body),
    onSuccess: () =>
      Promise.all(
        [queryKeys.planRequests.all, queryKeys.alerts.all, queryKeys.audit.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  })
}
