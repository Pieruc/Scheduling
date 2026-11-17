import type { IsoDateTime } from '@/api/types/common'

/** Stato di una commessa (contratti, A.3) */
export type OrderStatus = 'OPEN' | 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'

/** Commessa (contratti, A.3). priority: 1 = bassa, 2 = media, 3 = alta. */
export type Order = {
  id: string
  customer: string
  /** PROPOSTA §8: breve descrizione del lavoro, es. "Telaio carrello" */
  description: string
  domainProfile: string
  releaseDate: IsoDateTime
  /** null = scadenza non ancora inserita */
  dueDate: IsoDateTime | null
  priority: number
  weight: number
  status: OrderStatus
  /** PROPOSTA §8: numero di attività, per l'elenco senza caricare il grafo */
  activityCount: number
}

/** Un modo di eseguire un'attività: su quali risorse e in quanto tempo (contratti, A.3) */
export type ActivityMode = {
  resourceIds: string[]
  /** null = durata da stimare (la stima l'AI, modello M1) */
  durationMin: number | null
}

export type Activity = {
  id: string
  name: string
  requiredSkills: string[]
  modes: ActivityMode[]
}

/** Precedenza fine-inizio: `to` può iniziare solo dopo la fine di `from` (contratti, A.3) */
export type Precedence = {
  from: string
  to: string
  type: 'FS'
  minLagMin: number
  maxLagMin: number | null
}

/** GET / PUT /orders/{id}/process-graph */
export type ProcessGraph = {
  activities: Activity[]
  precedences: Precedence[]
}
