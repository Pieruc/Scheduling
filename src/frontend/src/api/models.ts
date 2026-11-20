import { apiFetch } from '@/api/client'
import type { ActiveModels, ModelsStatus, ModelVersion } from '@/api/types/models'

/** GET /models/active (contratti, A.7) */
export function getActiveModels(signal?: AbortSignal) {
  return apiFetch<ActiveModels>('/models/active', { signal })
}

/** GET /models (contratti, A.7): storico versioni, dalla più recente. Forma: PROPOSTA §8 */
export function getModelVersions(signal?: AbortSignal) {
  return apiFetch<ModelVersion[]>('/models', { signal })
}

/** PROPOSTA §8: GET /models/status, servizi attivi e uso della riserva */
export function getModelsStatus(signal?: AbortSignal) {
  return apiFetch<ModelsStatus>('/models/status', { signal })
}
