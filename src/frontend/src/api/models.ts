import { apiFetch } from '@/api/client'
import type { ActiveModels } from '@/api/types/models'

/** GET /models/active (contratti, A.7) */
export function getActiveModels(signal?: AbortSignal) {
  return apiFetch<ActiveModels>('/models/active', { signal })
}
