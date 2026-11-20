import type { IsoDateTime } from '@/api/types/common'

/** Tipo di risorsa (contratti, A.2) */
export type ResourceType = 'MACHINE' | 'PERSON' | 'ROOM'

/** PROPOSTA §8: indisponibilità programmata di una singola risorsa (manutenzione, ferie...) */
export type Unavailability = {
  from: IsoDateTime
  to: IsoDateTime
  reason: string
}

/** Risorsa (contratti, A.2 + PROPOSTA §8 per i campi marcati) */
export type Resource = {
  id: string
  name: string
  type: ResourceType
  capacity: number
  skills: string[]
  calendarId: string
  active: boolean
  /** PROPOSTA §8: euro all'ora, serve al costo stimato dei piani. null = non indicato */
  costPerHour: number | null
  /** PROPOSTA §8 */
  unavailability: Unavailability[]
}

/** Corpo di POST /resources e PUT /resources/{id} */
export type ResourceInput = Omit<Resource, 'active'>

/** PROPOSTA §8: un turno di lavoro, orari "HH:mm" */
export type Shift = { start: string; end: string }

/** PROPOSTA §8: giorno di chiusura dell'intero calendario */
export type Holiday = { date: string; name: string }

/**
 * Calendario dei turni (contratti, A.2: "turni, festività, indisponibilità").
 * PROPOSTA §8: stessi turni in tutti i giorni lavorativi; giorni 1 = lunedì ... 7 = domenica.
 */
export type Calendar = {
  id: string
  name: string
  /** Descrizione breve dei turni, es. "Lun–Ven 8–12 / 13–17" (la calcola il backend) */
  shiftsSummary: string
  workDays: number[]
  shifts: Shift[]
  holidays: Holiday[]
}

/** Corpo di POST /calendars e PUT /calendars/{id} (PROPOSTA §8) */
export type CalendarInput = Omit<Calendar, 'shiftsSummary'>

/** Competenza (contratti, A.2) */
export type Skill = {
  code: string
  name: string
}

/** Obiettivi del profilo, pesi 0–1 con somma 1 (contratti, A.2) */
export type ObjectiveDefaults = {
  makespan: number
  weightedTardiness: number
  setup: number
}

/** Profilo di dominio (contratti, A.2) */
export type DomainProfile = {
  code: string
  description: string
  defaultObjectiveWeights: ObjectiveDefaults
  /** Vincoli e caratteristiche attive, es. SEQUENCE_DEPENDENT_SETUP */
  features: string[]
  /** PROPOSTA §8: nome breve da mostrare, es. "Fabbrica" */
  name?: string
  /** PROPOSTA §8: il profilo usato di default dalle nuove pianificazioni */
  inUse?: boolean
}

/** Corpo di PUT /domain-profiles/{code} */
export type DomainProfileInput = Pick<DomainProfile, 'defaultObjectiveWeights' | 'features'>
