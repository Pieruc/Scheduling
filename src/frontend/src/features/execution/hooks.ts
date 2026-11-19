import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getOperatorDay, postExecution, postIncident } from '@/api/execution'
import { queryKeys } from '@/api/queryKeys'
import type { OperatorActivity, OperatorDay } from '@/api/types/execution'

/** Attività di oggi. Si ricarica ogni minuto: il pianificatore potrebbe aver ripianificato. */
export function useOperatorDay() {
  return useQuery({
    queryKey: queryKeys.operator.today,
    queryFn: ({ signal }) => getOperatorDay(signal),
    refetchInterval: 60_000,
  })
}

/** Inizia, pausa, riprendi, termina. La risposta aggiorna subito l'attività nella cache. */
export function useExecution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: postExecution,
    onSuccess: (updated: OperatorActivity) => {
      queryClient.setQueryData<OperatorDay>(queryKeys.operator.today, (day) =>
        day
          ? {
              ...day,
              activities: day.activities.map((a) =>
                a.planId === updated.planId && a.activityId === updated.activityId ? updated : a,
              ),
            }
          : day,
      )
    },
  })
}

/** Segnala un problema: diventa un avviso per il pianificatore. */
export function useIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: postIncident,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
  })
}
