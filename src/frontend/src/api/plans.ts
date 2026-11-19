import { apiFetch } from '@/api/client'
import type {
  CreatePlanRequest,
  DecisionRequest,
  DecisionResult,
  GanttView,
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

/** GET /plans/{id}/gantt: il piano pronto da disegnare, una riga per risorsa (contratti A.4) */
export function getPlanGantt(planId: string, signal?: AbortSignal) {
  return apiFetch<GanttView>(`/plans/${encodeURIComponent(planId)}/gantt`, { signal })
}

/**
 * POST /plans/{id}/decisions (contratti A.5): approva, rifiuta o modifica.
 * MODIFY crea una nuova versione verificata dal backend (422 se non ammissibile);
 * una decisione su un piano non PROPOSED risponde 409.
 */
export function postDecision(planId: string, body: DecisionRequest) {
  return apiFetch<DecisionResult>(`/plans/${encodeURIComponent(planId)}/decisions`, {
    method: 'POST',
    body,
  })
}
