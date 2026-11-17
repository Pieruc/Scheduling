import type { IsoDate } from '@/api/types/common'

/** Un punto della serie storica dei KPI (contratti, A.6 + PROPOSTA §8 per i campi marcati) */
export type KpiPoint = {
  /** Inizio del periodo (settimana) */
  date: IsoDate
  makespanMin: number
  lateOrders: number
  /** 0–1 */
  avgUtilization: number
  /** 0–1: quota di attività iniziate in orario rispetto al piano */
  planAdherence: number
  /** PROPOSTA §8, 0–1: quota di commesse consegnate entro la scadenza */
  onTimeRate: number
}

/** PROPOSTA §8: utilizzo di una risorsa nel periodo */
export type ResourceUtilization = {
  resourceId: string
  resourceName: string
  /** 0–1 */
  utilization: number
}

/** Risposta di GET /kpis */
export type KpiSeries = {
  points: KpiPoint[]
  /** PROPOSTA §8: utilizzo per risorsa nell'ultimo periodo */
  utilizationByResource: ResourceUtilization[]
}
