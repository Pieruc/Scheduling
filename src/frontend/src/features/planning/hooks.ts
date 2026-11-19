import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPlanRequest, interpretRequest } from '@/api/plans'
import { queryKeys } from '@/api/queryKeys'
import type { CreatePlanRequest } from '@/api/types/plans'

/** L'LLM legge la richiesta scritta a parole e dice cosa ha capito. */
export function useInterpretRequest() {
  return useMutation({ mutationFn: (text: string) => interpretRequest({ text }) })
}

/** Avvia il calcolo dei 3 piani (risposta 202); poi la pagina della richiesta ne segue lo stato. */
export function useCreatePlanRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePlanRequest) => createPlanRequest(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.planRequests.all }),
  })
}
