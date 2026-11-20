import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputTextarea } from 'primereact/inputtextarea'
import { Skeleton } from 'primereact/skeleton'
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import { ApiError, errorMessage } from '@/api/errors'
import type { GanttView, RescheduleEvent } from '@/api/types/plans'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { formatTime } from '@/lib/format'
import { VARIANT_LABEL } from '@/lib/labels'
import { useNow } from '@/lib/useNow'
import { useAlerts } from '@/features/dashboard/hooks'
import { IncidentReschedule } from './components/IncidentReschedule'
import { usePlanGantt, useReschedule } from './hooks'
import styles from './components/reschedule.module.css'

const TYPES = [
  {
    value: 'RESOURCE_DOWN',
    label: 'Macchina ferma',
    icon: 'pi-wrench',
    hint: 'Guasto o manutenzione',
  },
  { value: 'URGENT_ORDER', label: 'Commessa urgente', icon: 'pi-bolt', hint: 'Va anticipata' },
  { value: 'DELAY', label: 'Ritardo', icon: 'pi-clock', hint: 'Una commessa è indietro' },
] as const

const schema = z
  .object({
    type: z.enum(['RESOURCE_DOWN', 'URGENT_ORDER', 'DELAY']),
    resourceId: z.string().nullable(),
    from: z.date().nullable(),
    to: z.date().nullable(),
    orderId: z.string().nullable(),
    dueDate: z.date().nullable(),
    delayHours: z.number().nullable(),
    note: z.string().max(500, 'Al massimo 500 caratteri.'),
  })
  .superRefine((v, ctx) => {
    const need = (path: FieldPath<Values>, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.type === 'RESOURCE_DOWN') {
      if (!v.resourceId) need('resourceId', 'Scegli la macchina ferma.')
      if (!v.from) need('from', 'Indica da quando è ferma.')
      if (v.from && v.to && v.to <= v.from) need('to', 'La fine deve venire dopo l’inizio.')
    } else {
      if (!v.orderId) need('orderId', 'Scegli la commessa.')
      if (v.type === 'DELAY' && !(v.delayHours && v.delayHours > 0)) {
        need('delayHours', 'Indica di quante ore è in ritardo.')
      }
    }
  })

type Values = z.infer<typeof schema>

/** Valori iniziali del form manuale: macchina ferma da adesso */
function initialValues(): Values {
  return {
    type: 'RESOURCE_DOWN',
    resourceId: null,
    from: new Date(),
    to: null,
    orderId: null,
    dueDate: null,
    delayHours: null,
    note: '',
  }
}

function toEvent(v: Values): RescheduleEvent {
  if (v.type === 'RESOURCE_DOWN') {
    return {
      type: 'RESOURCE_DOWN',
      resourceId: v.resourceId!,
      from: v.from!.toISOString(),
      to: v.to?.toISOString() ?? null,
    }
  }
  if (v.type === 'URGENT_ORDER') {
    return { type: 'URGENT_ORDER', orderId: v.orderId!, dueDate: v.dueDate?.toISOString() ?? null }
  }
  return { type: 'DELAY', orderId: v.orderId!, delayMin: Math.round(v.delayHours! * 60) }
}

/**
 * /piani/:planId/ripianifica: ricalcola il piano in esecuzione dopo un imprevisto.
 * Con ?avviso=… il problema è già noto: riepilogo e ricalcolo, nessuna domanda.
 * Senza avviso (dal Gantt) si dice prima cosa è successo.
 */
export function ReschedulePage() {
  const { planId } = useParams()
  const [params] = useSearchParams()
  const alertId = params.get('avviso')
  const { data: view, isPending, isError, error, refetch } = usePlanGantt(planId)
  const alerts = useAlerts()
  const alert = alerts.data?.find((a) => a.id === alertId)

  const crumb = (
    <nav aria-label="Percorso" className={styles.crumb}>
      <Link to="/piani">Piani</Link> › <Link to={`/piani/${planId}`}>{planId}</Link> › Ripianifica
    </nav>
  )

  if (isPending || isError || (alertId && alerts.isPending)) {
    return (
      <>
        {crumb}
        <PageHeader title="Ripianifica" />
        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <Skeleton height="420px" />
        )}
      </>
    )
  }

  const planName = `${view.variant ? `piano ${VARIANT_LABEL[view.variant].toLowerCase()}` : 'piano'} ${view.planId}`

  if (view.status !== 'APPROVED') {
    return (
      <>
        {crumb}
        <PageHeader title={`Ripianifica il ${planName}`} />
        <Card>
          <p className={styles.muted}>
            Si ripianifica solo il piano approvato, quello in esecuzione. {view.planId} non lo è:{' '}
            <Link to={`/piani/${view.planId}`}>aprilo nel Gantt</Link> per valutarlo.
          </p>
        </Card>
      </>
    )
  }

  if (alertId && !alert?.event) {
    return (
      <>
        {crumb}
        <PageHeader title={`Ripianifica il ${planName}`} />
        <Card>
          <p className={styles.muted}>
            Questa segnalazione è già stata gestita (o non esiste più). Trovi le ripianificazioni in{' '}
            <Link to="/piani">Piani</Link>; per un problema nuovo usa{' '}
            <Link to={`/piani/${view.planId}/ripianifica`}>Ripianifica senza segnalazione</Link>.
          </p>
        </Card>
      </>
    )
  }

  return (
    <>
      {crumb}
      <PageHeader
        title={`Ripianifica il ${planName}`}
        subtitle={
          alert
            ? 'Il problema è già segnalato: guarda cosa tocca nel piano e ricalcola con l’AI.'
            : 'Dici cosa è successo: il sistema ricalcola da adesso e propone di nuovo 3 piani, confrontati con ATC ed EDD.'
        }
      />
      {alert?.event ? (
        <IncidentReschedule view={view} alert={{ ...alert, event: alert.event }} />
      ) : (
        <RescheduleForm view={view} />
      )}
    </>
  )
}

function RescheduleForm({ view }: { view: GanttView }) {
  const navigate = useNavigate()
  const toast = useToast()
  const now = useNow(60_000)
  const reschedule = useReschedule(view.planId)
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initialValues() })
  const [type, resourceId, orderId] = useWatch({ control, name: ['type', 'resourceId', 'orderId'] })

  const orderIds = [...new Set(view.bars.map((b) => b.orderId))].sort()
  const resourceName = (id: string) => view.resources.find((r) => r.id === id)?.name ?? id
  // Effetto sul piano attuale: quante attività toccano la macchina o la commessa scelta
  const touched =
    type === 'RESOURCE_DOWN'
      ? view.bars.filter((b) => b.resourceId === resourceId)
      : view.bars.filter((b) => b.orderId === orderId)

  const onSubmit = (v: Values) =>
    reschedule.mutate(
      {
        event: toEvent(v),
        freezeBefore: new Date().toISOString(),
        note: v.note.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          toast.success('Ripianificazione avviata', 'Tra pochi secondi i 3 nuovi piani.')
          navigate(`/piani/richieste/${res.id}`)
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === 422 && e.errors.length) {
            for (const err of e.errors) {
              setError(err.path.replace(/^event\./, '') as FieldPath<Values>, {
                message: err.message,
              })
            }
          } else {
            toast.error('Ripianificazione non avviata', errorMessage(e))
          }
        },
      },
    )

  return (
    <form className={styles.layout} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card title="Cosa è successo">
        <fieldset className={styles.types}>
          <legend className="visually-hidden">Tipo di evento</legend>
          {TYPES.map((t) => (
            <label key={t.value} className={styles.type}>
              <input type="radio" value={t.value} {...register('type')} />
              <i className={`pi ${t.icon}`} aria-hidden="true" />
              <span>
                <span className={styles.typeLabel}>{t.label}</span>
                <span className={styles.typeHint}>{t.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {type === 'RESOURCE_DOWN' ? (
          <>
            <FormField id="rs-resource" label="Macchina" error={errors.resourceId?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="resourceId"
                  render={({ field }) => (
                    <Dropdown
                      inputId={aria.id}
                      focusInputRef={field.ref}
                      value={field.value}
                      options={view.resources}
                      optionLabel="name"
                      optionValue="id"
                      onChange={(e) => field.onChange(e.value)}
                      placeholder="Scegli"
                      invalid={aria['aria-invalid']}
                    />
                  )}
                />
              )}
            </FormField>
            <div className={styles.twoCols}>
              <FormField id="rs-from" label="Ferma da" error={errors.from?.message}>
                {(aria) => (
                  <Controller
                    control={control}
                    name="from"
                    render={({ field }) => (
                      <Calendar
                        inputId={aria.id}
                        inputRef={field.ref}
                        value={field.value}
                        onChange={(e) => field.onChange(e.value ?? null)}
                        showTime
                        hourFormat="24"
                        dateFormat="D d M"
                        showIcon
                        invalid={aria['aria-invalid']}
                      />
                    )}
                  />
                )}
              </FormField>
              <FormField
                id="rs-to"
                label="Di nuovo disponibile"
                hint="Se non lo sai, lascialo vuoto: resta ferma fino a nuovo avviso."
                error={errors.to?.message}
              >
                {(aria) => (
                  <Controller
                    control={control}
                    name="to"
                    render={({ field }) => (
                      <Calendar
                        inputId={aria.id}
                        inputRef={field.ref}
                        value={field.value}
                        onChange={(e) => field.onChange(e.value ?? null)}
                        showTime
                        hourFormat="24"
                        dateFormat="D d M"
                        showIcon
                        showButtonBar
                        placeholder="Non si sa"
                        invalid={aria['aria-invalid']}
                        aria-describedby={aria['aria-describedby']}
                      />
                    )}
                  />
                )}
              </FormField>
            </div>
          </>
        ) : (
          <div className={styles.twoCols}>
            <FormField id="rs-order" label="Commessa" error={errors.orderId?.message}>
              {(aria) => (
                <Controller
                  control={control}
                  name="orderId"
                  render={({ field }) => (
                    <Dropdown
                      inputId={aria.id}
                      focusInputRef={field.ref}
                      value={field.value}
                      options={orderIds}
                      onChange={(e) => field.onChange(e.value)}
                      placeholder="Scegli"
                      invalid={aria['aria-invalid']}
                    />
                  )}
                />
              )}
            </FormField>
            {type === 'URGENT_ORDER' ? (
              <FormField
                id="rs-due"
                label="Nuova scadenza"
                hint="Vuoto = stessa scadenza, ma con priorità massima."
              >
                {(aria) => (
                  <Controller
                    control={control}
                    name="dueDate"
                    render={({ field }) => (
                      <Calendar
                        inputId={aria.id}
                        value={field.value}
                        onChange={(e) => field.onChange(e.value ?? null)}
                        dateFormat="D d M yy"
                        showIcon
                        showButtonBar
                        aria-describedby={aria['aria-describedby']}
                      />
                    )}
                  />
                )}
              </FormField>
            ) : (
              <FormField id="rs-delay" label="Ritardo (ore)" error={errors.delayHours?.message}>
                {(aria) => (
                  <Controller
                    control={control}
                    name="delayHours"
                    render={({ field }) => (
                      <InputNumber
                        inputId={aria.id}
                        inputRef={field.ref}
                        value={field.value}
                        onValueChange={(e) => field.onChange(e.value ?? null)}
                        min={0.25}
                        step={0.5}
                        maxFractionDigits={2}
                        suffix=" h"
                        showButtons
                        locale="it-IT"
                        invalid={aria['aria-invalid']}
                      />
                    )}
                  />
                )}
              </FormField>
            )}
          </div>
        )}

        <FormField id="rs-note" label="Nota (facoltativa)" error={errors.note?.message}>
          {(aria) => (
            <InputTextarea
              {...aria}
              rows={2}
              autoResize
              placeholder="Es. tecnico in arrivo domani mattina"
              {...register('note')}
            />
          )}
        </FormField>
      </Card>

      <div className={styles.side}>
        <Card title="Cosa cambia">
          <p className={styles.text}>
            {touched.length === 0
              ? type === 'RESOURCE_DOWN'
                ? resourceId
                  ? `Il piano non ha attività su ${resourceName(resourceId)}: i nuovi piani saranno simili a questo.`
                  : 'Scegli la macchina per vedere quante attività si spostano.'
                : orderId
                  ? `${orderId} non ha attività in questo piano.`
                  : 'Scegli la commessa per vedere quante attività cambiano.'
              : type === 'RESOURCE_DOWN'
                ? `${touched.length} attività su ${resourceName(resourceId!)} da spostare su un’altra macchina o più avanti.`
                : `${touched.length} attività di ${orderId} da rimettere in ordine.`}
          </p>
          {touched.length > 0 && (
            <ul className={styles.touched}>
              {touched.slice(0, 6).map((b) => (
                <li key={b.activityId}>
                  {b.orderId} · {b.activityName}
                </li>
              ))}
              {touched.length > 6 && <li>e altre {touched.length - 6}</li>}
            </ul>
          )}
          <p className={styles.muted}>
            Le attività iniziate prima di adesso ({formatTime(new Date(now).toISOString())}) restano
            dove sono. Il piano attuale resta in esecuzione finché non ne approvi uno nuovo.
          </p>
        </Card>
        <Button
          type="submit"
          label="Calcola i 3 nuovi piani"
          icon="pi pi-refresh"
          loading={reschedule.isPending}
          className={styles.submit}
        />
      </div>
    </form>
  )
}
