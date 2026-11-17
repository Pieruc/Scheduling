import { apiFetch } from '@/api/client'
import type { PlanRequest } from '@/api/types/plans'

/** PROPOSTA §8: GET /plan-requests, dalla più recente */
export function getPlanRequests(params: { limit?: number } = {}, signal?: AbortSignal) {
  return apiFetch<PlanRequest[]>('/plan-requests', { query: params, signal })
}

/** PROPOSTA §8: GET /plan-requests/{id}, con i tre piani e il loro stato */
export function getPlanRequest(id: string, signal?: AbortSignal) {
  return apiFetch<PlanRequest>(`/plan-requests/${encodeURIComponent(id)}`, { signal })
}
