/**
 * Funzioni pure sul piano disegnato nel Gantt. Il tempo è in minuti di lavoro dall'inizio del
 * periodo; ogni giornata vale `minutesPerDay` (480: turni 8–12 e 13–17).
 * Usate dal Gantt (controllo immediato) e dal backend finto (controllo al salvataggio).
 */
import type { GanttBar, GanttView, PlanChange } from '@/api/types/plans'

const weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric' })

/** Etichetta di un giorno del periodo: "2026-11-19" -> "gio 19" */
export function dayLabel(isoDate: string): string {
  return weekday.format(new Date(`${isoDate}T12:00:00`))
}

/** Ora del giorno di un minuto di lavoro: 0 -> 8:00, 240 -> 13:00 (dopo la pausa), 480 -> 17:00 */
function clock(minuteOfDay: number): string {
  const absolute = minuteOfDay < 240 ? 8 * 60 + minuteOfDay : 13 * 60 + (minuteOfDay - 240)
  const h = Math.floor(absolute / 60)
  const m = absolute % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Minuto di lavoro -> "gio 19, 13:30". `end` = true per le fini: 480 è "17:00" dello stesso giorno. */
export function workTime(
  view: Pick<GanttView, 'days' | 'minutesPerDay'>,
  minute: number,
  end = false,
) {
  const perDay = view.minutesPerDay
  let day = Math.floor(minute / perDay)
  let ofDay = minute % perDay
  if (end && ofDay === 0 && day > 0) {
    day -= 1
    ofDay = perDay
  }
  const iso = view.days[Math.min(day, view.days.length - 1)]
  return `${dayLabel(iso)}, ${clock(ofDay)}`
}

/** Intervallo di una barra: "gio 19, 8:00 – 11:40" oppure "gio 19, 13:30 – ven 20, 10:00" */
export function workRange(
  view: Pick<GanttView, 'days' | 'minutesPerDay'>,
  start: number,
  end: number,
) {
  const a = workTime(view, start)
  const b = workTime(view, end, true)
  const [dayA] = a.split(', ')
  const [dayB, timeB] = b.split(', ')
  return dayA === dayB ? `${a} – ${timeB}` : `${a} – ${b}`
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end

/**
 * Perché lo spostamento non si può fare, oppure null se è ammissibile.
 * Controlla: risorsa ammessa, periodo, precedenze, risorsa già occupata, risorsa ferma.
 */
export function moveProblem(view: GanttView, bars: GanttBar[], change: PlanChange): string | null {
  const bar = bars.find((b) => b.activityId === change.activityId)
  if (!bar) return 'Attività inesistente.'
  const resource = view.resources.find((r) => r.id === change.resourceId)
  const duration = bar.durations[change.resourceId]
  if (!resource || duration === undefined) {
    return `${bar.activityName} di ${bar.orderId} non si può fare su ${resource?.name ?? change.resourceId}: mancano le competenze.`
  }
  const moved = { start: change.start, end: change.start + duration }
  const total = view.days.length * view.minutesPerDay
  if (moved.start < 0 || moved.end > total) return 'Lo spostamento esce dal periodo pianificato.'

  const byId = new Map(bars.map((b) => [b.activityId, b]))
  for (const p of view.precedences) {
    if (p.to === bar.activityId) {
      const pred = byId.get(p.from)
      if (pred && pred.end > moved.start) {
        return `${bar.activityName} di ${bar.orderId} non può iniziare prima della fine di ${pred.activityName} (${workTime(view, pred.end, true)}).`
      }
    }
    if (p.from === bar.activityId) {
      const next = byId.get(p.to)
      if (next && moved.end > next.start) {
        return `${bar.activityName} di ${bar.orderId} deve finire prima che inizi ${next.activityName} (${workTime(view, next.start)}).`
      }
    }
  }

  const busy = bars.find(
    (b) =>
      b.activityId !== bar.activityId && b.resourceId === change.resourceId && overlaps(b, moved),
  )
  if (busy) {
    return `${resource.name} è già occupata da ${busy.activityName} di ${busy.orderId} (${workRange(view, busy.start, busy.end)}).`
  }

  const blocked = resource.unavailable.find((u) => overlaps(u, moved))
  if (blocked) {
    return `${resource.name} non è disponibile: ${blocked.reason.toLowerCase()} (${workRange(view, blocked.start, blocked.end)}).`
  }
  return null
}

/** Applica una modifica (già validata) e restituisce le barre aggiornate. */
export function applyChange(bars: GanttBar[], change: PlanChange): GanttBar[] {
  return bars.map((b) =>
    b.activityId === change.activityId
      ? {
          ...b,
          resourceId: change.resourceId,
          start: change.start,
          end: change.start + b.durations[change.resourceId],
        }
      : b,
  )
}

/** Durata complessiva del piano: dalla prima attività all'ultima fine (minuti di lavoro). */
export const makespan = (bars: GanttBar[]) => Math.max(0, ...bars.map((b) => b.end))

/** Ritardo totale: per ogni commessa, quanto l'ultima attività finisce dopo la scadenza. */
export function totalTardiness(view: GanttView, bars: GanttBar[]) {
  let total = 0
  for (const [orderId, due] of Object.entries(view.dueByOrder)) {
    if (due === null) continue
    const last = Math.max(0, ...bars.filter((b) => b.orderId === orderId).map((b) => b.end))
    total += Math.max(0, last - due)
  }
  return total
}
