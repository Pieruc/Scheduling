import type { IsoDateTime } from '@/api/types/common'

/** Stato di un piano (contratti, A.4) */
export type PlanStatus = 'PENDING' | 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED' | 'FAILED'

/** Chi ha prodotto il piano: la policy AI o un metodo di riserva (contratti, B.2) */
export type Solver = 'POLICY' | 'CP_SAT' | 'ATC' | 'EDD'

/**
 * PROPOSTA §8: le tre varianti prodotte da ogni richiesta.
 * ECONOMIC = più lento ma costo minimo; BALANCED = compromesso; FAST = più veloce ma più costoso.
 */
export type PlanVariant = 'ECONOMIC' | 'BALANCED' | 'FAST'

/** KPI di un piano. Tempi in minuti. (contratti, A.4 + PROPOSTA §8 per i campi marcati) */
export type PlanKpis = {
  makespanMin: number
  /** PROPOSTA §8: ritardo totale in minuti (il contratto ha weightedTardiness, adimensionale) */
  totalTardinessMin: number
  lateOrders: number
  totalSetupMin: number
  /** PROPOSTA §8 */
  setupCount: number
  /** PROPOSTA §8 */
  overtimeMin: number
  /** 0–1 */
  avgUtilization: number
  /** PROPOSTA §8: in euro, richiede il costo orario delle risorse */
  estimatedCost: number
}

/** Un piano come appare negli elenchi (senza le assegnazioni) */
export type PlanSummary = {
  id: string
  variant: PlanVariant | null
  status: PlanStatus
  solver: Solver
  modelVersion: string | null
  confidence: number | null
  kpis: PlanKpis | null
  createdAt: IsoDateTime
}

/** PROPOSTA §8: stato di una richiesta di pianificazione */
export type PlanRequestStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

/** PROPOSTA §8: una richiesta di pianificazione con i suoi (fino a) tre piani */
export type PlanRequest = {
  id: string
  status: PlanRequestStatus
  createdAt: IsoDateTime
  createdBy: string
  /** Breve descrizione mostrata negli elenchi, es. "Settimana 47" o "Ripianificazione guasto S2" */
  label: string
  orderIds: string[]
  horizonStart: IsoDateTime
  horizonEnd: IsoDateTime
  plans: PlanSummary[]
  /** Motivo, se status = FAILED */
  error?: string
}
