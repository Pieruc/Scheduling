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
  /** PROPOSTA §8: una frase che riassume il compromesso, es. "Nessun ritardo, 2 h di straordinario martedì" */
  summary?: string
}

/** PROPOSTA §8: stato di una richiesta di pianificazione */
export type PlanRequestStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

/** PROPOSTA §8: fase in corso mentre la richiesta è PENDING */
export type PlanRequestStage = 'VALIDATION' | 'CONTEXT' | 'POLICY' | 'BASELINES'

/**
 * PROPOSTA §8: pesi degli obiettivi da 0 a 10, come gli slider della UI.
 * Il backend li normalizza e li traduce in objective_weights della ProblemSpec.
 */
export type ObjectiveWeights = {
  /** Puntualità (weighted tardiness) */
  punctuality: number
  /** Evitare gli straordinari */
  overtime: number
  /** Ridurre i cambi di setup */
  setup: number
}

/** PROPOSTA §8: piano calcolato con una regola classica sugli stessi dati, per confronto */
export type Baseline = {
  solver: 'ATC' | 'EDD'
  kpis: PlanKpis
}

/** PROPOSTA §8: una richiesta di pianificazione con i suoi (fino a) tre piani */
export type PlanRequest = {
  id: string
  status: PlanRequestStatus
  /** Fase in corso, solo con status = PENDING */
  stage?: PlanRequestStage
  createdAt: IsoDateTime
  createdBy: string
  /** Breve descrizione mostrata negli elenchi, es. "Settimana 47" o "Ripianificazione guasto S2" */
  label: string
  orderIds: string[]
  horizonStart: IsoDateTime
  horizonEnd: IsoDateTime
  weights?: ObjectiveWeights
  plans: PlanSummary[]
  /** Piano migliore con i pesi scelti (di solito il BALANCED) */
  recommendedPlanId?: string
  baselines?: Baseline[]
  /** Secondi impiegati dal calcolo, se completata */
  elapsedSeconds?: number
  /** Motivo, se status = FAILED */
  error?: string
}

/** PROPOSTA §8: domanda su un dato mancante, a cui il pianificatore deve rispondere */
export type MissingDataQuestion =
  | { id: string; kind: 'DUE_DATE'; orderId: string; question: string }
  | {
      id: string
      kind: 'CHOICE'
      question: string
      options: { value: string; label: string }[]
    }

/** PROPOSTA §8: corpo di POST /plan-requests/interpret */
export type InterpretRequest = { text: string }

/** PROPOSTA §8: risposta di POST /plan-requests/interpret (testo dell'utente letto dall'LLM) */
export type Interpretation = {
  horizonStart: IsoDateTime
  horizonEnd: IsoDateTime
  orderIds: string[]
  /** Vincoli che il piano non violerà mai, in parole: "C-101 entro ven 20 nov" */
  hardConstraints: string[]
  /** Preferenze, diventano pesi: "Evitare straordinari" */
  preferences: string[]
  weights: ObjectiveWeights
  /** Perché un peso è cambiato rispetto al profilo, es. "lo hai scritto nella richiesta" */
  weightNotes: string[]
  missingData: MissingDataQuestion[]
}

/** PROPOSTA §8: corpo di POST /plan-requests (risponde 202 con { id, status: 'PENDING' }) */
export type CreatePlanRequest = {
  text: string
  horizonStart: IsoDateTime
  horizonEnd: IsoDateTime
  orderIds: string[]
  weights: ObjectiveWeights
  /** Risposte alle domande sui dati mancanti, per id della domanda */
  answers: Record<string, string>
}

/* ----------------------------------------------------------------------------------------
 * Gantt e decisioni (contratti A.4 e A.5)
 * Il tempo è in MINUTI DI LAVORO dall'inizio del periodo: ogni giorno lavorativo vale
 * `minutesPerDay` (480 = turni 8–12 e 13–17). Ipotesi da confermare (FRONTEND_STRUTTURA §8).
 * -------------------------------------------------------------------------------------- */

/** Fascia in cui una risorsa non è disponibile (manutenzione, guasto) */
export type GanttBlock = { start: number; end: number; reason: string }

export type GanttResource = {
  id: string
  name: string
  unavailable: GanttBlock[]
}

/** Un'attività assegnata a una risorsa (una barra del Gantt) */
export type GanttBar = {
  activityId: string
  activityName: string
  orderId: string
  resourceId: string
  start: number
  end: number
  /** Risorse su cui l'attività può essere spostata, con la durata su ciascuna (minuti) */
  durations: Record<string, number>
  /** Durata scritta nella commessa; null = non inserita, l'ha stimata l'AI */
  declaredMin: number | null
  /** Stima di M1 con intervallo all'80% (minuti), se presente */
  estimate?: { value: number; low: number; high: number; confidence: number }
}

/** GET /plans/{id}/gantt (contratti A.4: "vista pronta per il Gantt, righe per risorsa") */
export type GanttView = {
  planId: string
  requestId: string
  status: PlanStatus
  variant: PlanVariant | null
  solver: Solver
  modelVersion: string | null
  confidence: number | null
  kpis: PlanKpis
  /** Giorni lavorativi del periodo (AAAA-MM-GG) */
  days: string[]
  minutesPerDay: number
  resources: GanttResource[]
  bars: GanttBar[]
  precedences: { from: string; to: string }[]
  /** Scadenza di ogni commessa in minuti di lavoro (null = nessuna) */
  dueByOrder: Record<string, number | null>
  /** Modifiche manuali già incluse in questa versione */
  manualChanges: number
}

/** Una modifica manuale: attività spostata su una risorsa e/o a un nuovo inizio */
export type PlanChange = { activityId: string; resourceId: string; start: number }

/** POST /plans/{id}/decisions (contratti A.5) */
export type DecisionRequest =
  | { decision: 'APPROVE' }
  | { decision: 'REJECT'; reason: string }
  | { decision: 'MODIFY'; reason: string; changes: PlanChange[] }

/** Risposta: con MODIFY, l'id della nuova versione del piano */
export type DecisionResult = { planId: string; status: PlanStatus }
