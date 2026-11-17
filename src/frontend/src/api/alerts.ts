import { apiFetch } from '@/api/client'
import type { Alert } from '@/api/types/alerts'

/** PROPOSTA §8: GET /alerts, avvisi aperti per la dashboard */
export function getAlerts(signal?: AbortSignal) {
  return apiFetch<Alert[]>('/alerts', { signal })
}
