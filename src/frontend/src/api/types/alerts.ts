import type { IsoDateTime } from '@/api/types/common'

/** PROPOSTA §8: tipo di avviso mostrato nella dashboard */
export type AlertType =
  | 'INCIDENT' // segnalazione dall'operatore (guasto, materiale mancante, ritardo)
  | 'PLANS_TO_REVIEW' // una richiesta ha piani pronti da valutare
  | 'MAINTENANCE' // indisponibilità programmata di una risorsa

/** PROPOSTA §8: risposta di GET /alerts */
export type Alert = {
  id: string
  type: AlertType
  title: string
  detail: string
  createdAt: IsoDateTime
  /** Dove porta il link dell'avviso */
  link?: { label: string; planRequestId?: string; planId?: string }
}
