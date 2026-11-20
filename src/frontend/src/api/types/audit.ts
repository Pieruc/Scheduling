import type { IsoDateTime } from '@/api/types/common'
import type { Solver } from '@/api/types/plans'

/** Tipo di evento tracciato (contratti, A.8) */
export type AuditAction = 'PLAN_GENERATED' | 'DECISION' | 'RESCHEDULE' | 'FALLBACK_USED'

/** Un record di tracciabilità (contratti, A.8) + campi PROPOSTA §8 in `details` */
export type AuditRecord = {
  id: string
  timestamp: IsoDateTime
  planId: string
  /** Chi ha agito; "system" per gli eventi automatici */
  user: string
  action: AuditAction
  modelVersion: string | null
  solver: Solver | null
  inputHash: string
  outputHash: string | null
  /** PROPOSTA §8: quello che serve a leggere il record senza aprire il piano */
  details?: {
    /** Con DECISION */
    decision?: 'APPROVE' | 'REJECT' | 'MODIFY'
    reason?: string
    /** Con MODIFY: la nuova versione creata */
    newPlanId?: string
    /** Con MODIFY: gli spostamenti, già in parole */
    changes?: string[]
    /** Con PLAN_GENERATED: tutti i piani della richiesta */
    planIds?: string[]
    /** Con FALLBACK_USED: confidenza dell'AI (0–1), assente se il servizio era giù */
    confidence?: number
    /** Con FALLBACK_USED e RESCHEDULE: cosa l'ha causato, es. "Guasto Saldatrice S2" */
    trigger?: string
  }
}
