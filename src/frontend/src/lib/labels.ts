import type { ResourceType } from '@/api/types/config'
import type { OrderStatus } from '@/api/types/orders'
import type { PlanRequest, PlanVariant, Solver } from '@/api/types/plans'

/** Tono di colore di un'etichetta di stato (vedi components/StatusTag) */
export type Tone = 'blue' | 'green' | 'red' | 'amber' | 'grey'

export const VARIANT_LABEL: Record<PlanVariant, string> = {
  ECONOMIC: 'Economico',
  BALANCED: 'Bilanciato',
  FAST: 'Veloce',
}

/** Chi ha generato un piano, in parole: "AI (POLICY v1.3)", "Regola ATC (riserva)" */
export function solverLabel(solver: Solver, modelVersion: string | null): string {
  if (solver === 'POLICY') {
    const version = modelVersion?.match(/(\d+\.\d+)/)?.[1]
    return version ? `AI (POLICY v${version})` : 'AI (POLICY)'
  }
  return solver === 'CP_SAT' ? 'CP-SAT (riserva)' : `Regola ${solver} (riserva)`
}

/**
 * Stato complessivo di una richiesta, ricavato dai suoi piani:
 * in elaborazione, fallita, approvata, da valutare, rifiutata o sostituita.
 */
export function requestStatus(request: PlanRequest): { label: string; tone: Tone } {
  if (request.status === 'PENDING') return { label: 'In elaborazione', tone: 'grey' }
  if (request.status === 'FAILED') return { label: 'Fallita', tone: 'red' }
  const statuses = request.plans.map((p) => p.status)
  if (statuses.includes('APPROVED')) return { label: 'Approvato', tone: 'green' }
  if (statuses.includes('PROPOSED')) return { label: 'Da valutare', tone: 'blue' }
  if (statuses.includes('SUPERSEDED')) return { label: 'Sostituito', tone: 'grey' }
  return { label: 'Rifiutato', tone: 'red' }
}

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  MACHINE: 'Macchina',
  PERSON: 'Persona',
  ROOM: 'Stanza',
}

/** Priorità di una commessa: 1 bassa, 2 media, 3 alta (contratti, A.3) */
export function priorityLabel(priority: number): { label: string; tone: Tone } {
  if (priority >= 3) return { label: 'Alta', tone: 'red' }
  if (priority === 2) return { label: 'Media', tone: 'amber' }
  return { label: 'Bassa', tone: 'grey' }
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Aperta', tone: 'blue' },
  PLANNED: { label: 'Pianificata', tone: 'blue' },
  IN_PROGRESS: { label: 'In lavorazione', tone: 'amber' },
  DONE: { label: 'Completata', tone: 'green' },
  CANCELLED: { label: 'Annullata', tone: 'grey' },
}
