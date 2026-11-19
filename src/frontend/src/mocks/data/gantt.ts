import type { GanttBar, GanttBlock, GanttResource, GanttView, PlanSummary } from '@/api/types/plans'
import { makespan, totalTardiness } from '@/lib/schedule'
import { resources } from './config'
import { orders, processGraphs } from './orders'
import { planRequests } from './planRequests'

const PER_DAY = 480
const DAYS = 5
/** Stima di M1 per le durate mancanti (minuti): valore e intervallo all'80% */
const ESTIMATE = { value: 255, low: 210, high: 300, confidence: 0.82 }

/** I prossimi giorni lavorativi a partire da domani (AAAA-MM-GG) */
function workingDays(): string[] {
  const days: string[] = []
  const d = new Date()
  while (days.length < DAYS) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      days.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      )
    }
  }
  return days
}

const dateOf = (iso: string) => iso.slice(0, 10)

/** Piano disposto in modo semplice ma ammissibile: precedenze, risorse libere, macchine ferme. */
function schedule(): Omit<
  GanttView,
  | 'planId'
  | 'requestId'
  | 'status'
  | 'variant'
  | 'solver'
  | 'modelVersion'
  | 'confidence'
  | 'kpis'
  | 'manualChanges'
> {
  const days = workingDays()
  const used = new Set(
    Object.values(processGraphs).flatMap((g) =>
      g.activities.flatMap((a) => a.modes.flatMap((m) => m.resourceIds)),
    ),
  )

  const rows: GanttResource[] = resources
    .filter((r) => r.active && used.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      // Una giornata con indisponibilità diventa interamente bloccata (semplificazione del mock)
      unavailable: days.flatMap((day, i): GanttBlock[] =>
        r.unavailability
          .filter((u) => dateOf(u.from) <= day && day <= dateOf(u.to))
          .map((u) => ({ start: i * PER_DAY, end: (i + 1) * PER_DAY, reason: u.reason })),
      ),
    }))

  const planned = orders
    .filter((o) => o.status === 'OPEN' && processGraphs[o.id])
    .sort(
      (a, b) => b.priority - a.priority || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
    )

  const bars: GanttBar[] = []
  const precedences: { from: string; to: string }[] = []
  const blocksOf = (resourceId: string) => [
    ...bars.filter((b) => b.resourceId === resourceId),
    ...(rows.find((r) => r.id === resourceId)?.unavailable ?? []),
  ]
  const earliest = (resourceId: string, ready: number, duration: number) => {
    let t = ready
    for (;;) {
      const clash = blocksOf(resourceId).find((x) => t < x.end && x.start < t + duration)
      if (!clash) return t
      t = clash.end
    }
  }

  for (const order of planned) {
    const graph = processGraphs[order.id]
    precedences.push(...graph.precedences.map((p) => ({ from: p.from, to: p.to })))
    for (const a of graph.activities) {
      const ready = Math.max(
        0,
        ...graph.precedences
          .filter((p) => p.to === a.id)
          .map((p) => bars.find((b) => b.activityId === p.from)?.end ?? 0),
      )
      const durations: Record<string, number> = {}
      for (const m of a.modes) {
        for (const r of m.resourceIds) durations[r] = m.durationMin ?? ESTIMATE.value
      }
      const options = Object.entries(durations)
        .filter(([r]) => rows.some((row) => row.id === r))
        .map(([r, d]) => ({ r, d, start: earliest(r, ready, d) }))
        .sort((x, y) => x.start + x.d - (y.start + y.d))
      const best = options[0]
      if (!best) continue
      const declared = a.modes[0].durationMin
      bars.push({
        activityId: a.id,
        activityName: a.name,
        orderId: order.id,
        resourceId: best.r,
        start: best.start,
        end: best.start + best.d,
        durations,
        declaredMin: declared,
        estimate:
          declared === null
            ? ESTIMATE
            : {
                value: Math.round(declared * 1.1),
                low: declared,
                high: Math.round(declared * 1.35),
                confidence: 0.86,
              },
      })
    }
  }

  const dueByOrder = Object.fromEntries(
    planned.map((o) => {
      if (!o.dueDate) return [o.id, null]
      const index = days.findIndex((d) => d >= dateOf(o.dueDate!))
      return [o.id, index < 0 ? (DAYS + 1) * PER_DAY : (index + 1) * PER_DAY]
    }),
  )

  return { days, minutesPerDay: PER_DAY, resources: rows, bars, precedences, dueByOrder }
}

/** Gantt già calcolati, per id del piano (le versioni modificate si aggiungono qui) */
export const gantts = new Map<string, GanttView>()

export function findPlan(planId: string) {
  for (const request of planRequests) {
    const plan = request.plans.find((p) => p.id === planId)
    if (plan) return { request, plan }
  }
  return null
}

export function ganttFor(planId: string): GanttView | null {
  const cached = gantts.get(planId)
  const found = findPlan(planId)
  if (!found) return cached ?? null
  const { request, plan } = found
  if (cached) return { ...cached, status: plan.status }

  const base = schedule()
  const view: GanttView = {
    ...base,
    planId,
    requestId: request.id,
    status: plan.status,
    variant: plan.variant,
    solver: plan.solver,
    modelVersion: plan.modelVersion,
    confidence: plan.confidence,
    kpis: {
      ...plan.kpis!,
      makespanMin: makespan(base.bars),
    },
    manualChanges: 0,
  }
  view.kpis.totalTardinessMin = totalTardiness(view, view.bars)
  gantts.set(planId, view)
  return view
}

/** Riassunto (per elenchi e confronto) di una nuova versione creata da MODIFY */
export function versionSummary(from: PlanSummary, view: GanttView): PlanSummary {
  return {
    ...from,
    id: view.planId,
    status: 'PROPOSED',
    createdAt: new Date().toISOString(),
    kpis: view.kpis,
    summary: `Versione modificata a mano (${view.manualChanges} ${view.manualChanges === 1 ? 'modifica' : 'modifiche'}).`,
  }
}
