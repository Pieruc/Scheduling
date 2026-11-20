import { apiFetch } from '@/api/client'
import type { Order, OrderInput, OrderStatus, ProcessGraph } from '@/api/types/orders'

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

/** POST /orders: nuova commessa (OPEN, senza attività) */
export function createOrder(input: OrderInput) {
  return apiFetch<Order>('/orders', { method: 'POST', body: input })
}

/** PUT /orders/{id}: dati della commessa (contratti, A.3) */
export function updateOrder(input: OrderInput) {
  return apiFetch<Order>(`/orders/${encodeURIComponent(input.id)}`, { method: 'PUT', body: input })
}

/**
 * DELETE /orders/{id} (contratti, A.3). PROPOSTA §8: non cancella, la mette CANCELLED,
 * così piani e audit che la citano restano leggibili.
 */
export function cancelOrder(id: string) {
  return apiFetch<void>(`/orders/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
