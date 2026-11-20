import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { InputTextarea } from 'primereact/inputtextarea'
import { SelectButton } from 'primereact/selectbutton'
import { Skeleton } from 'primereact/skeleton'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { ApiError, errorMessage } from '@/api/errors'
import type { GanttView, PlanChange } from '@/api/types/plans'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { FormField } from '@/components/FormField'
import { KpiCard } from '@/components/KpiCard'
import { PageHeader } from '@/components/PageHeader'
import { useCan } from '@/features/auth/authContext'
import { rescheduleHref } from './rescheduleLink'
import { StatusTag } from '@/components/StatusTag'
import { formatEuro, formatHours, formatPercent, formatWorkDuration } from '@/lib/format'
import { solverLabel, VARIANT_INFO, VARIANT_LABEL, type Tone } from '@/lib/labels'
import { applyChange, makespan, moveProblem, totalTardiness } from '@/lib/schedule'
import { ActivityPanel } from './components/ActivityPanel'
import { GanttChart } from './components/GanttChart'
import { useDecision, usePlanGantt } from './hooks'
import ganttStyles from './components/gantt.module.css'
import styles from './components/review.module.css'

const STATUS: Record<GanttView['status'], { label: string; tone: Tone }> = {
  PENDING: { label: 'In elaborazione', tone: 'grey' },
  PROPOSED: { label: 'Da valutare', tone: 'blue' },
  APPROVED: { label: 'Approvato', tone: 'green' },
  REJECTED: { label: 'Rifiutato', tone: 'red' },
  SUPERSEDED: { label: 'Sostituito', tone: 'grey' },
  FAILED: { label: 'Fallito', tone: 'red' },
}

/** Mockup v2, schermata 5: /piani/:planId */
export function PlanGanttPage() {
  const { planId } = useParams()
  const gantt = usePlanGantt(planId)

  if (gantt.isPending) return <Skeleton height="520px" />
  if (gantt.isError) {
    return (
      <>
        <PageHeader title="Piano" />
        <ErrorState error={gantt.error} onRetry={() => gantt.refetch()} />
      </>
    )
  }
  // key: cambiando piano (o versione) la revisione riparte dai suoi dati
  return <Review key={gantt.data.planId} view={gantt.data} />
}

function Review({ view }: { view: GanttView }) {
  const canPlan = useCan('plan')
  const navigate = useNavigate()
  const toast = useToast()
  const decision = useDecision(view.planId)
  const [bars, setBars] = useState(view.bars)
  const [changes, setChanges] = useState<Map<string, PlanChange>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const [zoom, setZoom] = useState<'detail' | 'fit'>('detail')
  // true quando si esce di proposito (dopo un salvataggio): la protezione non deve scattare
  const leaving = useRef(false)

  const editable = view.status === 'PROPOSED'
  const dirty = changes.size > 0
  const variant = view.variant ?? 'BALANCED'
  const title = `Piano ${VARIANT_INFO[variant].letter} · ${VARIANT_LABEL[variant]}`
  const status = STATUS[view.status]

  // Un colore per commessa, nello stesso ordine in tutto il piano
  const orderIds = useMemo(() => [...new Set(view.bars.map((b) => b.orderId))], [view.bars])
  const colorOf = (orderId: string) => `var(--fs-job-${(orderIds.indexOf(orderId) % 4) + 1})`

  const onMove = (change: PlanChange) => {
    const problem = moveProblem(view, bars, change)
    if (problem) {
      setMessage({ text: problem, error: true })
      return problem
    }
    setBars((current) => applyChange(current, change))
    setChanges((current) => new Map(current).set(change.activityId, change))
    setMessage({ text: 'Spostamento applicato. Durata e ritardo sono ricalcolati.', error: false })
    return null
  }

  const resetChanges = () => {
    setBars(view.bars)
    setChanges(new Map())
    setMessage(null)
    setReasonError(undefined)
  }

  const handleError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 422) {
      const onReason = error.errors.find((e) => e.path === 'reason')
      if (onReason) return setReasonError(onReason.message)
    }
    toast.error('Operazione non riuscita', errorMessage(error))
  }

  const needReason = () => {
    if (reason.trim()) return false
    setReasonError('Scrivi il motivo: finisce nell’audit.')
    document.getElementById('decision-reason')?.focus()
    return true
  }

  const approve = () =>
    confirmDialog({
      header: `Approvare il ${title}?`,
      message:
        'Diventa il piano in esecuzione. Le altre alternative della stessa richiesta vengono scartate.',
      icon: 'pi pi-check-circle',
      acceptLabel: 'Approva',
      rejectLabel: 'Annulla',
      accept: () =>
        decision.mutate(
          { decision: 'APPROVE' },
          { onSuccess: () => toast.success('Piano approvato', title), onError: handleError },
        ),
    })

  const saveVersion = () => {
    if (needReason()) return
    decision.mutate(
      { decision: 'MODIFY', reason, changes: [...changes.values()] },
      {
        onSuccess: ({ planId }) => {
          toast.success('Nuova versione creata', `${planId}: ora puoi approvarla.`)
          leaving.current = true
          navigate(`/piani/${planId}`, { replace: true })
        },
        onError: handleError,
      },
    )
  }

  const reject = () => {
    if (needReason()) return
    confirmDialog({
      header: `Rifiutare il ${title}?`,
      message: 'Il piano non verrà usato. Il motivo resta nell’audit.',
      icon: 'pi pi-times-circle',
      acceptLabel: 'Rifiuta',
      rejectLabel: 'Annulla',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: () =>
        decision.mutate(
          { decision: 'REJECT', reason },
          { onSuccess: () => toast.success('Piano rifiutato', title), onError: handleError },
        ),
    })
  }

  // Modifiche non salvate: conferma prima di cambiare pagina o chiudere la scheda
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !leaving.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    confirmDialog({
      header: 'Uscire senza salvare?',
      message: 'Gli spostamenti fatti su questo piano andranno persi.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Esci senza salvare',
      rejectLabel: 'Resta qui',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: () => blocker.proceed(),
      reject: () => blocker.reset(),
      onHide: () => blocker.state === 'blocked' && blocker.reset(),
    })
  }, [blocker])
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const span = makespan(bars)
  const tardiness = totalTardiness(view, bars)
  const recalculated = dirty ? ' · ricalcolato' : ''

  return (
    <>
      <nav aria-label="Percorso" className={styles.crumb}>
        <Link to="/piani">Piani</Link> ›{' '}
        <Link to={`/piani/richieste/${view.requestId}`}>Richiesta {view.requestId}</Link> ›{' '}
        {view.planId}
      </nav>
      <PageHeader
        title={title}
        actions={
          <>
            <StatusTag label={status.label} tone={status.tone} />
            {/* Il piano in esecuzione si ripianifica dopo un imprevisto */}
            {view.status === 'APPROVED' && canPlan && (
              <Link
                to={rescheduleHref(view.planId)}
                className={`p-button p-button-outlined ${styles.rescheduleLink}`}
              >
                <i className="pi pi-refresh" aria-hidden="true" />
                Ripianifica
              </Link>
            )}
          </>
        }
      />
      <div className={styles.tags}>
        <StatusTag
          label={`Generato da ${solverLabel(view.solver, view.modelVersion)}${view.confidence ? ` · confidenza ${formatPercent(view.confidence)}` : ''}`}
          tone="blue"
        />
        {view.manualChanges + changes.size > 0 && (
          <StatusTag
            label={`${view.manualChanges + changes.size} ${view.manualChanges + changes.size === 1 ? 'modifica manuale' : 'modifiche manuali'}`}
            tone="amber"
          />
        )}
      </div>

      <section aria-label="Indicatori del piano" className={styles.kpis}>
        <KpiCard label={`Durata totale${recalculated}`} value={formatWorkDuration(span)} />
        <KpiCard
          label={`Ritardo totale${recalculated}`}
          value={formatHours(tardiness)}
          note={tardiness > 0 ? 'oltre le scadenze' : 'tutte nei tempi'}
          noteTone={tardiness > 0 ? 'bad' : 'good'}
        />
        <KpiCard label="Straordinari" value={formatHours(view.kpis.overtimeMin)} />
        <KpiCard label="Costo stimato" value={formatEuro(view.kpis.estimatedCost)} />
      </section>

      {!editable && (
        <p className={styles.readOnly} role="note">
          <i className="pi pi-lock" aria-hidden="true" /> Questo piano è{' '}
          {status.label.toLowerCase()}: si può consultare ma non modificare.
        </p>
      )}

      {message && (
        <p
          className={`${styles.message} ${message.error ? styles.messageError : styles.messageOk}`}
          role={message.error ? 'alert' : 'status'}
        >
          {message.error && <strong>Spostamento non valido. </strong>}
          {message.text}
          {message.error && ' La barra è tornata al suo posto.'}
        </p>
      )}

      <div className={styles.layout}>
        <Card className={styles.chartCard}>
          <div className={styles.chartTools}>
            <SelectButton
              value={zoom}
              options={[
                { value: 'detail', label: 'Dettaglio' },
                { value: 'fit', label: 'Tutto il periodo' },
              ]}
              onChange={(e) => e.value && setZoom(e.value)}
              allowEmpty={false}
              aria-label="Zoom del Gantt"
            />
          </div>
          <GanttChart
            pxPerHour={zoom === 'detail' ? 40 : undefined}
            view={view}
            bars={bars}
            selectedId={selectedId}
            editable={editable}
            colorOf={colorOf}
            onSelect={setSelectedId}
            onMove={onMove}
          />
          <ul className={ganttStyles.legend} aria-label="Legenda">
            {orderIds.map((id) => (
              <li key={id}>
                <span className={ganttStyles.swatch} style={{ background: colorOf(id) }} />
                {id}
              </li>
            ))}
            <li>
              <span className={`${ganttStyles.swatch} ${ganttStyles.swatchBlocked}`} />
              Non disponibile
            </li>
            <li>
              <span className={`${ganttStyles.swatch} ${ganttStyles.swatchEstimated}`} />
              Durata stimata dall’AI
            </li>
            {editable && <li>Trascina una barra per spostarla o cambiarle risorsa</li>}
          </ul>
        </Card>

        <div className={styles.side}>
          <ActivityPanel
            view={view}
            bar={bars.find((b) => b.activityId === selectedId)}
            editable={editable}
            onMove={onMove}
          />

          {editable && (
            <Card title="Decisione">
              <FormField
                id="decision-reason"
                label={dirty ? 'Motivo delle modifiche' : 'Motivo (per rifiutare)'}
                hint="Obbligatorio per modificare o rifiutare: finisce nell’audit."
                error={reasonError}
              >
                {(aria) => (
                  <InputTextarea
                    {...aria}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value)
                      setReasonError(undefined)
                    }}
                    rows={3}
                    autoResize
                    invalid={aria['aria-invalid']}
                  />
                )}
              </FormField>
              <div className={styles.decisionButtons}>
                {dirty ? (
                  <Button
                    label="Salva come nuova versione"
                    icon="pi pi-save"
                    loading={decision.isPending}
                    onClick={saveVersion}
                  />
                ) : (
                  <Button
                    label="Approva"
                    icon="pi pi-check"
                    severity="success"
                    loading={decision.isPending}
                    onClick={approve}
                  />
                )}
                <Button
                  label="Rifiuta"
                  severity="danger"
                  outlined
                  disabled={decision.isPending}
                  onClick={reject}
                />
                {dirty && <Button label="Annulla modifiche" text onClick={resetChanges} />}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
