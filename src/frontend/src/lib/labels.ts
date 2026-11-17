import type { ResourceType } from '@/api/types/config'
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
