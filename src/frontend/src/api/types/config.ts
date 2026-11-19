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

/** Calendario dei turni (contratti, A.2; qui solo i campi usati dalle liste) */
export type Calendar = {
  id: string
  name: string
  /** Descrizione breve dei turni, es. "Lun–Ven 8–12 / 13–17" */
  shiftsSummary: string
}

/** Competenza (contratti, A.2) */
export type Skill = {
  code: string
  name: string
}
