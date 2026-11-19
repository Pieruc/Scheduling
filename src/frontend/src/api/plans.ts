import { apiFetch } from '@/api/client'
import type {
  CreatePlanRequest,
  Interpretation,
  InterpretRequest,
  PlanRequest,
} from '@/api/types/plans'

/** PROPOSTA §8: GET /plan-requests, dalla più recente */
export function getPlanRequests(params: { limit?: number } = {}, signal?: AbortSignal) {
  return apiFetch<PlanRequest[]>('/plan-requests', { query: params, signal })
}

/** PROPOSTA §8: GET /plan-requests/{id}, con i tre piani e il loro stato */
export function getPlanRequest(id: string, signal?: AbortSignal) {
  return apiFetch<PlanRequest>(`/plan-requests/${encodeURIComponent(id)}`, { signal })
}

/** PROPOSTA §8: POST /plan-requests/interpret, l'LLM legge la richiesta scritta a parole */
export function interpretRequest(body: InterpretRequest) {
  return apiFetch<Interpretation>('/plan-requests/interpret', { method: 'POST', body })
}

/** PROPOSTA §8: POST /plan-requests -> 202 { id, status: 'PENDING' }; poi si interroga GET /plan-requests/{id} */
export function createPlanRequest(body: CreatePlanRequest) {
  return apiFetch<Pick<PlanRequest, 'id' | 'status'>>('/plan-requests', { method: 'POST', body })
}
