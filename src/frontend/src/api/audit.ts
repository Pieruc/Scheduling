import { apiFetch } from '@/api/client'
import type { AuditRecord } from '@/api/types/audit'

/**
 * GET /audit?planId=&from=&to= (contratti A.8), dal più recente.
 * Azione e utente si filtrano nel browser (PROPOSTA §8: parametri action e user).
 */
export function getAudit(
  params: { planId?: string; from?: string; to?: string },
  signal?: AbortSignal,
) {
  return apiFetch<AuditRecord[]>('/audit', { query: params, signal })
}
