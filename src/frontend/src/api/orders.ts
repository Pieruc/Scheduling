import { apiFetch } from '@/api/client'
import type { Order, OrderStatus, ProcessGraph } from '@/api/types/orders'

/** GET /orders?status= (contratti, A.3) */
export function getOrders(params: { status?: OrderStatus } = {}, signal?: AbortSignal) {
  return apiFetch<Order[]>('/orders', { query: params, signal })
}

/** GET /orders/{id}/process-graph: attività e precedenze */
export function getProcessGraph(orderId: string, signal?: AbortSignal) {
  return apiFetch<ProcessGraph>(`/orders/${encodeURIComponent(orderId)}/process-graph`, { signal })
}

/** PUT /orders/{id}/process-graph: il backend rifiuta con 422 un grafo con cicli */
export function saveProcessGraph(orderId: string, graph: ProcessGraph) {
  return apiFetch<ProcessGraph>(`/orders/${encodeURIComponent(orderId)}/process-graph`, {
    method: 'PUT',
    body: graph,
  })
}
