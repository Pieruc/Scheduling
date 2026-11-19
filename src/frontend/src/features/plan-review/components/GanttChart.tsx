import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { GanttBar, GanttView, PlanChange } from '@/api/types/plans'
import { dayLabel, workRange } from '@/lib/schedule'
import styles from './gantt.module.css'

/** Passo di aggancio durante il trascinamento (minuti) */
const SNAP = 15

type GanttChartProps = {
  view: GanttView
  bars: GanttBar[]
  selectedId: string | null
  editable: boolean
  /** Pixel per ora di lavoro; assente = tutto il periodo nello spazio disponibile */
  pxPerHour?: number
  colorOf: (orderId: string) => string
  onSelect: (activityId: string) => void
  /** Prova lo spostamento: restituisce il motivo del rifiuto oppure null se applicato */
  onMove: (change: PlanChange) => string | null
}

type Drag = {
  activityId: string
  originX: number
  originStart: number
  moved: boolean
  preview: { start: number; resourceId: string }
}

/** Gantt delle risorse: una riga per risorsa, una barra per attività, giorni in orizzontale. */
export function GanttChart(props: GanttChartProps) {
  const { view, bars, selectedId, editable, pxPerHour, colorOf, onSelect, onMove } = props
  const total = view.days.length * view.minutesPerDay
  const axisRef = useRef<HTMLDivElement>(null)
  const laneRefs = useRef(new Map<string, HTMLDivElement>())
  const [drag, setDrag] = useState<Drag | null>(null)
  // Dopo un trascinamento il browser manda anche un "click": va ignorato
  const justDragged = useRef(false)

  const pct = (minutes: number) => `${(minutes / total) * 100}%`

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, bar: GanttBar) => {
    if (!editable || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({
      activityId: bar.activityId,
      originX: e.clientX,
      originStart: bar.start,
      moved: false,
      preview: { start: bar.start, resourceId: bar.resourceId },
    })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>, bar: GanttBar) => {
    if (!drag || drag.activityId !== bar.activityId || !axisRef.current) return
    const width = axisRef.current.getBoundingClientRect().width
    const dx = e.clientX - drag.originX
    if (!drag.moved && Math.abs(dx) < 4) return
    // Riga sotto il puntatore: diventa la risorsa di destinazione
    let resourceId = drag.preview.resourceId
    for (const [id, el] of laneRefs.current) {
      const r = el.getBoundingClientRect()
      if (e.clientY >= r.top && e.clientY <= r.bottom) resourceId = id
    }
    const duration = bar.durations[resourceId] ?? bar.end - bar.start
    const delta = Math.round(((dx / width) * total) / SNAP) * SNAP
    const start = Math.min(Math.max(0, drag.originStart + delta), total - duration)
    setDrag({ ...drag, moved: true, preview: { start, resourceId } })
  }

  const onPointerUp = (bar: GanttBar) => {
    if (!drag || drag.activityId !== bar.activityId) return
    setDrag(null)
    if (!drag.moved) return
    justDragged.current = true
    const { start, resourceId } = drag.preview
    if (start !== bar.start || resourceId !== bar.resourceId) {
      onMove({ activityId: bar.activityId, resourceId, start })
    }
    onSelect(bar.activityId)
  }

  return (
    <div className={styles.scroller}>
      <div
        className={styles.chart}
        role="group"
        aria-label="Gantt delle risorse"
        // Con lo zoom "Dettaglio" il Gantt è più largo del riquadro e scorre dentro di esso
        style={
          pxPerHour
            ? { minWidth: 96 + (view.days.length * view.minutesPerDay * pxPerHour) / 60 }
            : undefined
        }
      >
        <div />
        <div
          ref={axisRef}
          className={styles.axis}
          style={{ ['--days' as string]: view.days.length }}
        >
          {view.days.map((d) => (
            <div key={d} className={styles.day}>
              {dayLabel(d)}
            </div>
          ))}
        </div>

        {view.resources.map((res) => (
          <div key={res.id} className={styles.row} role="presentation">
            <div className={styles.resName}>{res.name}</div>
            <div
              className={styles.lane}
              style={{ ['--days' as string]: view.days.length }}
              ref={(el) => {
                if (el) laneRefs.current.set(res.id, el)
                else laneRefs.current.delete(res.id)
              }}
            >
              {res.unavailable.map((u) => (
                <div
                  key={`${u.start}-${u.reason}`}
                  className={styles.blocked}
                  style={{ left: pct(u.start), width: pct(u.end - u.start) }}
                  title={`${u.reason}: ${workRange(view, u.start, u.end)}`}
                >
                  {u.reason}
                </div>
              ))}

              {bars.map((bar) => {
                const dragging = drag?.activityId === bar.activityId && drag.moved
                const resourceId = dragging ? drag.preview.resourceId : bar.resourceId
                if (resourceId !== res.id) return null
                const start = dragging ? drag.preview.start : bar.start
                const duration = dragging
                  ? (bar.durations[resourceId] ?? bar.end - bar.start)
                  : bar.end - bar.start
                const estimated = bar.declaredMin === null
                return (
                  <button
                    key={bar.activityId}
                    type="button"
                    className={[
                      styles.bar,
                      bar.activityId === selectedId ? styles.selected : '',
                      dragging ? styles.dragging : '',
                      estimated ? styles.estimated : '',
                      editable ? styles.movable : '',
                    ].join(' ')}
                    style={{
                      left: pct(start),
                      width: pct(duration),
                      ['--bar' as string]: colorOf(bar.orderId),
                    }}
                    aria-pressed={bar.activityId === selectedId}
                    aria-label={`${bar.orderId} ${bar.activityName}, ${res.name}, ${workRange(view, bar.start, bar.end)}${estimated ? ', durata stimata dall’AI' : ''}`}
                    onPointerDown={(e) => onPointerDown(e, bar)}
                    onPointerMove={(e) => onPointerMove(e, bar)}
                    onPointerUp={() => onPointerUp(bar)}
                    onPointerCancel={() => setDrag(null)}
                    onClick={() => {
                      if (justDragged.current) {
                        justDragged.current = false
                        return
                      }
                      onSelect(bar.activityId)
                    }}
                  >
                    <span className={styles.barText}>
                      {bar.orderId} {bar.activityName}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
