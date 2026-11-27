import type { IsoDateTime } from '@/api/types/common'

/**
 * Una versione attiva di un modello AI (contratti, A.7).
 * Metriche note, tutte facoltative tranne quelle del contratto:
 * - policy: gapVsCpSat, winRateVsAtc, avgInferenceMs (contratto) + winRateVsEdd (PROPOSTA §8)
 * - context: durationMape (contratto) + weeklyEstimates, intervalCoverage, avgInferenceMs (PROPOSTA §8)
 */
export type ActiveModel = {
  version: string
  publishedAt: IsoDateTime
  metrics: Record<string, number>
  /** PROPOSTA §8: dataset di addestramento, es. "ds-2026-10-25" */
  datasetVersion?: string
  /** PROPOSTA §8: versione della ProblemSpec che il modello sa leggere */
  specVersion?: string
}

/** Risposta di GET /models/active (contratti, A.7) */
/** Un componente è null finché la pipeline non ha pubblicato nessuna versione */
export type ActiveModels = {
  policy: ActiveModel | null
  context: ActiveModel | null
}

/** M2 = POLICY (ordine delle attività), M1 = CONTEXT (stima di durate e setup) */
export type ModelComponent = 'POLICY' | 'CONTEXT'

/** CANDIDATE = in valutazione offline, non ancora usata per i piani (contratto A.7) */
export type ModelVersionStatus = 'ACTIVE' | 'CANDIDATE' | 'RETIRED'

/** PROPOSTA §8: una riga di GET /models (storico versioni, contratti A.7) */
export type ModelVersion = {
  version: string
  component: ModelComponent
  publishedAt: IsoDateTime
  status: ModelVersionStatus
  metrics: Record<string, number>
}

/**
 * PROPOSTA §8: GET /models/status — stato dei servizi e quanti piani ha prodotto ciascun
 * metodo negli ultimi `days` giorni (per capire quanto spesso scatta la riserva).
 */
export type ModelsStatus = {
  aiServiceUp: boolean
  cpSatAvailable: boolean
  /** Sotto questa confidenza (0–1) si usa il metodo di riserva */
  confidenceThreshold: number
  days: number
  plansBySolver: { POLICY: number; CP_SAT: number; ATC: number; EDD: number }
}
