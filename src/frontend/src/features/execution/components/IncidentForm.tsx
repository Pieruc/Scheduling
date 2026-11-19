import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { InputTextarea } from 'primereact/inputtextarea'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorMessage } from '@/api/errors'
import type { IncidentKind, OperatorActivity, OperatorDay } from '@/api/types/execution'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { FormField } from '@/components/FormField'
import { useIncident } from '../hooks'
import styles from './operator.module.css'

const KINDS: { value: IncidentKind; label: string; icon: string }[] = [
  { value: 'BREAKDOWN', label: 'Guasto macchina', icon: 'pi-wrench' },
  { value: 'MISSING_MATERIAL', label: 'Materiale mancante', icon: 'pi-box' },
  { value: 'DELAY', label: 'Sono in ritardo', icon: 'pi-clock' },
  { value: 'OTHER', label: 'Altro', icon: 'pi-comment' },
]

const schema = z
  .object({
    kind: z.enum(['BREAKDOWN', 'MISSING_MATERIAL', 'DELAY', 'OTHER']).nullable(),
    resourceId: z.string().nullable(),
    note: z.string().max(500, 'Al massimo 500 caratteri'),
  })
  .superRefine((v, ctx) => {
    if (!v.kind)
      ctx.addIssue({ code: 'custom', path: ['kind'], message: 'Scegli che problema c’è' })
    if (v.kind === 'BREAKDOWN' && !v.resourceId) {
      ctx.addIssue({
        code: 'custom',
        path: ['resourceId'],
        message: 'Indica quale macchina è guasta',
      })
    }
    if (v.kind === 'OTHER' && !v.note.trim()) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Scrivi cosa è successo' })
    }
  })

type Values = z.infer<typeof schema>

type IncidentFormProps = {
  day: OperatorDay
  /** Attività in corso: la segnalazione viene collegata a lei e alla sua macchina */
  current: OperatorActivity | undefined
}

/** Mockup v2, schermata 6: "Segnala un problema" */
export function IncidentForm({ day, current }: IncidentFormProps) {
  const toast = useToast()
  const incident = useIncident()
  const defaults: Values = { kind: null, resourceId: current?.resourceId ?? null, note: '' }
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults })

  const onSubmit = handleSubmit((v) => {
    incident.mutate(
      {
        kind: v.kind!,
        resourceId: v.resourceId ?? undefined,
        planId: current?.planId,
        activityId: current?.activityId,
        note: v.note.trim() || undefined,
        timestamp: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          toast.success('Segnalazione inviata', 'Il pianificatore la vede subito negli avvisi.')
          reset(defaults)
        },
        onError: (e) => toast.error('Segnalazione non inviata', errorMessage(e)),
      },
    )
  })

  return (
    <Card title="Segnala un problema">
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <p className={styles.formIntro}>
          Il pianificatore riceve subito l’avviso e può ripianificare.
        </p>

        <fieldset
          className={styles.kinds}
          aria-describedby={errors.kind ? 'kind-error' : undefined}
        >
          <legend className={styles.legend}>Che problema c’è?</legend>
          <div className={styles.kindGrid}>
            {KINDS.map((k) => (
              <label key={k.value} className={styles.kind}>
                <input type="radio" value={k.value} {...register('kind')} />
                <i className={`pi ${k.icon}`} aria-hidden="true" />
                {k.label}
              </label>
            ))}
          </div>
          {errors.kind && (
            <small id="kind-error" className={styles.fieldError}>
              {errors.kind.message}
            </small>
          )}
        </fieldset>

        <FormField
          id="incident-resource"
          label="Macchina"
          hint="Obbligatoria per un guasto"
          error={errors.resourceId?.message}
        >
          {(aria) => (
            <Controller
              control={control}
              name="resourceId"
              render={({ field }) => (
                <Dropdown
                  inputId={aria.id}
                  focusInputRef={field.ref}
                  value={field.value}
                  options={day.resources}
                  optionLabel="name"
                  optionValue="id"
                  onChange={(e) => field.onChange(e.value ?? null)}
                  placeholder="Nessuna in particolare"
                  showClear
                  invalid={aria['aria-invalid']}
                  aria-describedby={aria['aria-describedby']}
                  className={styles.fullWidth}
                />
              )}
            />
          )}
        </FormField>

        <FormField
          id="incident-note"
          label="Cosa è successo"
          hint="Facoltativo, tranne per «Altro»"
          error={errors.note?.message}
        >
          {(aria) => (
            <InputTextarea
              {...aria}
              {...register('note')}
              rows={3}
              autoResize
              placeholder="Es. la S2 non si accende, ho avvisato la manutenzione."
              className={styles.fullWidth}
            />
          )}
        </FormField>

        <Button
          type="submit"
          label="Invia segnalazione"
          icon="pi pi-send"
          severity="danger"
          loading={incident.isPending}
          className={styles.submit}
        />
      </form>
    </Card>
  )
}
