import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelOrder,
  createOrder,
  getOrders,
  getProcessGraph,
  saveProcessGraph,
  updateOrder,
} from '@/api/orders'
import { queryKeys } from '@/api/queryKeys'
import type { OrderInput, ProcessGraph } from '@/api/types/orders'

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

/** Crea o modifica i dati di una commessa; poi ricarica l'elenco */
export function useSaveOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, isNew }: { input: OrderInput; isNew: boolean }) =>
      isNew ? createOrder(input) : updateOrder(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all, exact: true }),
  })
}

export function useCancelOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cancelOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all, exact: true }),
  })
}
