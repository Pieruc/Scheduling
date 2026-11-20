import type { ActiveModels, ModelsStatus, ModelVersion } from '@/api/types/models'

/** Modelli attivi (contratti, A.7, esempio + campi PROPOSTA §8; mockup v2, schermata 9). */
export const activeModels: ActiveModels = {
  policy: {
    version: 'm2-policy-1.3.0',
    publishedAt: '2026-10-28T12:00:00Z',
    metrics: { gapVsCpSat: 0.04, winRateVsAtc: 0.81, winRateVsEdd: 0.93, avgInferenceMs: 420 },
    datasetVersion: 'ds-2026-10-25',
    specVersion: '1.0',
  },
  context: {
    version: 'm1-context-1.1.0',
    publishedAt: '2026-10-20T09:00:00Z',
    metrics: { durationMape: 0.12, weeklyEstimates: 38, intervalCoverage: 0.8, avgInferenceMs: 35 },
    datasetVersion: 'ds-2026-10-18',
    specVersion: '1.0',
  },
}

/** Storico versioni, dalla più recente */
export const modelVersions: ModelVersion[] = [
  {
    version: 'm2-policy-1.4.0-rc1',
    component: 'POLICY',
    publishedAt: '2026-11-14T10:00:00Z',
    status: 'CANDIDATE',
    metrics: { gapVsCpSat: 0.036, winRateVsAtc: 0.84 },
  },
  {
    version: 'm2-policy-1.3.0',
    component: 'POLICY',
    publishedAt: '2026-10-28T12:00:00Z',
    status: 'ACTIVE',
    metrics: { gapVsCpSat: 0.04, winRateVsAtc: 0.81 },
  },
  {
    version: 'm1-context-1.1.0',
    component: 'CONTEXT',
    publishedAt: '2026-10-20T09:00:00Z',
    status: 'ACTIVE',
    metrics: { durationMape: 0.12 },
  },
  {
    version: 'm2-policy-1.2.0',
    component: 'POLICY',
    publishedAt: '2026-10-10T09:00:00Z',
    status: 'RETIRED',
    metrics: { gapVsCpSat: 0.061, winRateVsAtc: 0.74 },
  },
  {
    version: 'm1-context-1.0.0',
    component: 'CONTEXT',
    publishedAt: '2026-10-02T09:00:00Z',
    status: 'RETIRED',
    metrics: { durationMape: 0.17 },
  },
]

export const modelsStatus: ModelsStatus = {
  aiServiceUp: true,
  cpSatAvailable: true,
  confidenceThreshold: 0.6,
  days: 30,
  plansBySolver: { POLICY: 39, CP_SAT: 2, ATC: 1, EDD: 0 },
}
