import type { IsoDateTime } from '@/api/types/common'

/** Evento registrato dall'operatore (contratti, A.6) */
export type ExecutionEvent = 'START' | 'PAUSE' | 'RESUME' | 'END'

/** POST /executions (contratti, A.6). timestamp = momento in cui l'operatore preme il pulsante */
export type ExecutionRequest = {
  planId: string
  activityId: string
  resourceIds: string[]
  event: ExecutionEvent
  timestamp: IsoDateTime
  note?: string
}

/** PROPOSTA §8: stato di un'attività vista dall'operatore, ricavato dagli eventi registrati */
export type OperatorActivityState = 'TODO' | 'IN_PROGRESS' | 'PAUSED' | 'DONE'

/** PROPOSTA §8: un'attività del piano approvato assegnata alle risorse dell'operatore */
export type OperatorActivity = {
  planId: string
  activityId: string
  activityName: string
  orderId: string
  customer: string
  resourceId: string
  resourceName: string
  plannedStart: IsoDateTime
  plannedEnd: IsoDateTime
  state: OperatorActivityState
  /** Minuti già lavorati nei tratti conclusi (prima dell'ultima pausa) */
  workedMin: number
  /** Inizio del tratto in corso, solo con state = IN_PROGRESS */
  runningSince: IsoDateTime | null
  actualStart: IsoDateTime | null
  actualEnd: IsoDateTime | null
  /** Attività precedente non ancora finita: finché c'è, non si può iniziare */
  waitingFor?: { activityName: string; plannedEnd: IsoDateTime }
}

/** PROPOSTA §8: risposta di GET /operator/today (l'operatore arriverà dal token, dopo il login) */
export type OperatorDay = {
  date: string
  operatorName: string
  department: string
  /** Turni del giorno, es. [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }] */
  shifts: { start: string; end: string }[]
  /** Risorse su cui lavora l'operatore: servono alla segnalazione di un guasto */
  resources: { id: string; name: string }[]
  /** In ordine di inizio previsto */
  activities: OperatorActivity[]
}

/** PROPOSTA §8: tipo di problema segnalato */
export type IncidentKind = 'BREAKDOWN' | 'MISSING_MATERIAL' | 'DELAY' | 'OTHER'

/** PROPOSTA §8: POST /incidents -> 201 { id }. Diventa un avviso nella dashboard del pianificatore */
export type IncidentRequest = {
  kind: IncidentKind
  resourceId?: string
  planId?: string
  activityId?: string
  note?: string
  timestamp: IsoDateTime
}
