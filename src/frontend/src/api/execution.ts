import { apiFetch } from '@/api/client'
import type {
  ExecutionRequest,
  IncidentRequest,
  OperatorActivity,
  OperatorDay,
} from '@/api/types/execution'

/** PROPOSTA §8: GET /operator/today, le attività di oggi dell'operatore collegato */
export function getOperatorDay(signal?: AbortSignal) {
  return apiFetch<OperatorDay>('/operator/today', { signal })
}

/**
 * POST /executions (contratti A.6): inizio, pausa, ripresa o fine di un'attività.
 * PROPOSTA §8: risposta 201 con l'attività aggiornata; 409 se il passaggio non è ammesso
 * (es. un'altra attività è già in corso).
 */
export function postExecution(body: ExecutionRequest) {
  return apiFetch<OperatorActivity>('/executions', { method: 'POST', body })
}

/** PROPOSTA §8: POST /incidents, segnalazione di un problema al pianificatore */
export function postIncident(body: IncidentRequest) {
  return apiFetch<{ id: string }>('/incidents', { method: 'POST', body })
}
