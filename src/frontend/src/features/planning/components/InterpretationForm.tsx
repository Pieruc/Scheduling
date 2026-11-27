import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { MultiSelect } from 'primereact/multiselect'
import { SelectButton } from 'primereact/selectbutton'
import { Slider } from 'primereact/slider'
import { useEffect } from 'react'
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { ApiError } from '@/api/errors'
import type { Interpretation, ObjectiveWeights } from '@/api/types/plans'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { FormField } from '@/components/FormField'
import { useOrders } from '@/features/orders/hooks'
import { useNow } from '@/lib/useNow'
import { useCreatePlanRequest } from '../hooks'
import styles from './planning.module.css'

type Values = {
  horizon: (Date | null)[]
  orderIds: string[]
  weights: ObjectiveWeights
  answers: Record<string, string | Date | null>
}

const WEIGHTS: { key: keyof ObjectiveWeights; label: string }[] = [
  { key: 'punctuality', label: 'Puntualità' },
  { key: 'overtime', label: 'Evitare straordinari' },
  { key: 'setup', label: 'Ridurre i setup' },
]

type InterpretationFormProps = {
  text: string
  interpretation: Interpretation
  /** Quante domande sui dati mancanti sono ancora senza risposta (per lo stepper) */
  onUnansweredChange: (count: number) => void
}

const dueText = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function InterpretationForm({
  text,
  interpretation,
  onUnansweredChange,
}: InterpretationFormProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreatePlanRequest()
  const { data: orders = [] } = useOrders()
  const openOrders = orders.filter((o) => o.status === 'OPEN')

  const {
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    defaultValues: {
      horizon: [new Date(interpretation.horizonStart), new Date(interpretation.horizonEnd)],
      orderIds: interpretation.orderIds,
      weights: interpretation.weights,
      answers: Object.fromEntries(interpretation.missingData.map((q) => [q.id, null])),
    },
  })

  // Lo stepper in alto conta le domande ancora senza risposta
  const answers = useWatch({ control, name: 'answers' })
  const unanswered = Object.values(answers ?? {}).filter((v) => !v).length
  useEffect(() => onUnansweredChange(unanswered), [unanswered, onUnansweredChange])

  // Scadenze che cadono prima dell'inizio del periodo: con questi dati il piano sarebbe in ritardo
  const [horizon, chosen] = useWatch({ control, name: ['horizon', 'orderIds'] })
  const start = horizon?.[0] ?? null
  const now = useNow(60_000)
  const dueOf = (id: string): Date | null => {
    // La risposta a "quando va consegnata?" vale più della scadenza (mancante) della commessa
    const q = interpretation.missingData.find((m) => m.kind === 'DUE_DATE' && m.orderId === id)
    const answered = q ? answers?.[q.id] : null
    if (answered instanceof Date) return answered
    const due = orders.find((o) => o.id === id)?.dueDate
    return due ? new Date(due) : null
  }
  const early = start
    ? (chosen ?? []).flatMap((id) => {
        const due = dueOf(id)
        return due && due < start ? [{ id, due }] : []
      })
    : []
  const canStartToday = early.some((e) => e.due.getTime() > now)
  const startToday = () => {
    // Da adesso, arrotondato al quarto d'ora successivo; la fine del periodo resta quella scelta
    const from = new Date(Math.ceil(now / 900_000) * 900_000)
    setValue('horizon', [from, horizon?.[1] ?? null], { shouldDirty: true })
  }

  const onSubmit = (values: Values) => {
    const [start, end] = values.horizon
    create.mutate(
      {
        text,
        horizonStart: start!.toISOString(),
        horizonEnd: end!.toISOString(),
        orderIds: values.orderIds,
        weights: values.weights,
        answers: Object.fromEntries(
          Object.entries(values.answers).map(([id, v]) => [
            id,
            v instanceof Date ? v.toISOString() : String(v),
          ]),
        ),
      },
      {
        onSuccess: ({ id }) => {
          toast.success('Calcolo avviato', 'Sto preparando i 3 piani.')
          navigate(`/piani/richieste/${id}`)
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 422) {
            for (const e of error.errors)
              setError(e.path as FieldPath<Values>, { message: e.message })
          }
        },
      },
    )
  }

  const missing = interpretation.missingData.length

  return (
    <form className={styles.column} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card title="Ecco cosa ho capito">
        <FormField id="plan-horizon" label="Periodo da pianificare" error={errors.horizon?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="horizon"
              rules={{
                validate: (v) => (v[0] && v[1] ? true : 'Scegli il primo e l’ultimo giorno.'),
              }}
              render={({ field }) => (
                <Calendar
                  inputId={aria.id}
                  inputRef={field.ref}
                  value={field.value}
                  onChange={(e) => field.onChange(e.value)}
                  selectionMode="range"
                  dateFormat="D d M"
                  readOnlyInput
                  showIcon
                  invalid={aria['aria-invalid']}
                />
              )}
            />
          )}
        </FormField>

        {early.length > 0 && (
          <div className={styles.dueWarning} role="alert">
            <p>
              <i className="pi pi-exclamation-triangle" aria-hidden="true" />{' '}
              {early.map((e) => `${e.id} scade ${dueText.format(e.due)}`).join(', ')}:{' '}
              {early.length === 1 ? 'è' : 'sono'} prima dell’inizio del periodo, quindi il piano
              {early.length === 1 ? ' la consegnerebbe' : ' le consegnerebbe'} in ritardo.
            </p>
            {canStartToday ? (
              <Button
                type="button"
                label="Fai partire il periodo da adesso"
                size="small"
                outlined
                onClick={startToday}
              />
            ) : (
              <p>La scadenza è già passata: cambiala nella commessa o accetta il ritardo.</p>
            )}
          </div>
        )}

        <FormField id="plan-orders" label="Commesse" error={errors.orderIds?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="orderIds"
              rules={{ validate: (v) => (v.length ? true : 'Scegli almeno una commessa.') }}
              render={({ field }) => (
                <MultiSelect
                  inputId={aria.id}
                  value={field.value}
                  options={openOrders.map((o) => ({
                    value: o.id,
                    label: `${o.id} · ${o.customer}`,
                  }))}
                  onChange={(e) => field.onChange(e.value)}
                  display="chip"
                  invalid={aria['aria-invalid']}
                />
              )}
            />
          )}
        </FormField>

        <div className={styles.facts}>
          <div>
            <h3 className={styles.factTitle}>Vincoli rigidi</h3>
            {interpretation.hardConstraints.length ? (
              <ul className={styles.factList}>
                {interpretation.hardConstraints.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Nessuno oltre ai turni e alle precedenze.</p>
            )}
          </div>
          <div>
            <h3 className={styles.factTitle}>Preferenze</h3>
            {interpretation.preferences.length ? (
              <ul className={styles.factList}>
                {interpretation.preferences.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Nessuna: valgono i pesi del profilo.</p>
            )}
          </div>
        </div>
        <p className={styles.muted}>
          I vincoli rigidi non vengono mai violati; le preferenze diventano i pesi qui sotto.
        </p>
      </Card>

      <Card title="Quanto conta ogni obiettivo">
        {WEIGHTS.map(({ key, label }) => (
          <Controller
            key={key}
            control={control}
            name={`weights.${key}`}
            render={({ field }) => (
              <div className={styles.weight}>
                <span id={`w-${key}`} className={styles.weightLabel}>
                  {label}
                </span>
                <Slider
                  value={field.value}
                  onChange={(e) => field.onChange(e.value as number)}
                  min={0}
                  max={10}
                  step={1}
                  className={styles.slider}
                  aria-labelledby={`w-${key}`}
                />
                <output className={styles.weightValue} aria-hidden="true">
                  {field.value}
                </output>
              </div>
            )}
          />
        ))}
        {interpretation.weightNotes.map((n) => (
          <p key={n} className={styles.muted}>
            {n}
          </p>
        ))}
        <p className={styles.muted}>
          I pesi guidano il piano <strong>Bilanciato</strong>; Economico e Veloce restano i due
          estremi.
        </p>
      </Card>

      {missing > 0 && (
        <Card
          title={`Prima di pianificare mi ${missing === 1 ? 'serve 1 dato' : `servono ${missing} dati`}`}
          className={styles.missingCard}
        >
          {interpretation.missingData.map((q) => {
            const error = errors.answers?.[q.id]?.message
            return (
              <FormField key={q.id} id={`answer-${q.id}`} label={q.question} error={error}>
                {(aria) => (
                  <Controller
                    control={control}
                    name={`answers.${q.id}`}
                    rules={{ validate: (v) => (v ? true : 'Rispondi a questa domanda.') }}
                    render={({ field }) =>
                      q.kind === 'DUE_DATE' ? (
                        <Calendar
                          inputId={aria.id}
                          inputRef={field.ref}
                          value={field.value as Date | null}
                          onChange={(e) => field.onChange(e.value ?? null)}
                          minDate={new Date()}
                          dateFormat="D d M yy"
                          readOnlyInput
                          showIcon
                          placeholder="Scegli la data"
                          invalid={aria['aria-invalid']}
                        />
                      ) : (
                        <SelectButton
                          id={aria.id}
                          value={field.value}
                          options={q.options}
                          onChange={(e) => field.onChange(e.value ?? null)}
                          invalid={aria['aria-invalid']}
                          className={styles.choice}
                        />
                      )
                    }
                  />
                )}
              </FormField>
            )
          })}
        </Card>
      )}

      {create.isError && !(create.error instanceof ApiError && create.error.status === 422) && (
        <ErrorState error={create.error} />
      )}

      <div className={styles.submit}>
        <Button
          type="submit"
          label="Genera i 3 piani"
          icon="pi pi-play"
          loading={create.isPending}
        />
      </div>
    </form>
  )
}
