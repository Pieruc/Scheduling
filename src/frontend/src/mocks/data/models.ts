import type { ActiveModels } from '@/api/types/models'

/** Modelli attivi (contratti, A.7, esempio). */
export const activeModels: ActiveModels = {
  policy: {
    version: 'm2-policy-1.3.0',
    publishedAt: '2026-10-28T12:00:00Z',
    metrics: { gapVsCpSat: 0.04, winRateVsAtc: 0.81, avgInferenceMs: 420 },
  },
  context: {
    version: 'm1-context-1.1.0',
    publishedAt: '2026-10-20T09:00:00Z',
    metrics: { durationMape: 0.12 },
  },
}
