import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getOrders, getProcessGraph, saveProcessGraph } from '@/api/orders'
import { queryKeys } from '@/api/queryKeys'
import type { ProcessGraph } from '@/api/types/orders'

export function useOrders() {
  return useQuery({
    queryKey: queryKeys.orders.all,
    queryFn: ({ signal }) => getOrders({}, signal),
  })
}

export function useProcessGraph(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.graph(orderId ?? ''),
    queryFn: ({ signal }) => getProcessGraph(orderId!, signal),
    enabled: Boolean(orderId),
  })
}

/** Salva il grafo; aggiorna subito la cache con la risposta e ricarica l'elenco commesse. */
export function useSaveProcessGraph(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (graph: ProcessGraph) => saveProcessGraph(orderId, graph),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.orders.graph(orderId), saved)
      return queryClient.invalidateQueries({ queryKey: queryKeys.orders.all, exact: true })
    },
  })
}
