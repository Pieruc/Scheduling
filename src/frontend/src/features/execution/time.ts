import type { OperatorActivity } from '@/api/types/execution'
import { formatHours } from '@/lib/format'

/** Minuti lavorati finora: tratti conclusi + tratto in corso */
export function workedMinutes(a: OperatorActivity, now: number) {
  const running = a.runningSince ? Math.max(0, (now - Date.parse(a.runningSince)) / 60_000) : 0
  return Math.floor(a.workedMin + running)
}

/** Minuti lavorati in parole: "meno di un minuto", "45 min", "1 h 52" */
export const formatWorked = (minutes: number) =>
  minutes < 1 ? 'meno di un minuto' : formatHours(minutes)
