import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { Dialog } from 'primereact/dialog'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { MultiSelect } from 'primereact/multiselect'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { Resource, Skill } from '@/api/types/config'
import type { Activity } from '@/api/types/orders'
import { FormField } from '@/components/FormField'
import styles from './orderForm.module.css'

const schema = z.object({
  name: z.string().trim().min(1, 'Inserisci il nome dell’attività.'),
  requiredSkills: z.array(z.string()).min(1, 'Scegli almeno una competenza.'),
  modes: z
    .array(
      z
        .object({
          resourceIds: z.array(z.string()).min(1, 'Scegli almeno una risorsa.'),
          hours: z.number().nullable(),
          unknown: z.boolean(),
        })
        .refine((m) => m.unknown || (m.hours !== null && m.hours > 0), {
          path: ['hours'],
          message: 'Inserisci la durata, oppure lasciala stimare all’AI.',
        }),
    )
    .min(1, 'Aggiungi almeno un modo di eseguirla.'),
  after: z.array(z.string()),
})

type Values = z.infer<typeof schema>

/** Quello che il form restituisce al grafo: l'attività e le attività che devono finire prima */
export type ActivityDraft = { activity: Activity; after: string[] }

type ActivityFormProps = {
  /** Assente = nuova attività */
  activity?: Activity
  /** Id da usare per una nuova attività */
  newId: string
  /** Le altre attività della commessa, per la scelta "Dopo" */
  others: Activity[]
  after: string[]
  resources: Resource[]
  skills: Skill[]
  onSave: (draft: ActivityDraft) => void
  onDelete?: () => void
  onClose: () => void
}

function toValues(a: Activity | undefined, after: string[]): Values {
  return {
    name: a?.name ?? '',
    requiredSkills: a?.requiredSkills ?? [],
    modes: a?.modes.map((m) => ({
      resourceIds: m.resourceIds,
      hours: m.durationMin === null ? null : m.durationMin / 60,
      unknown: m.durationMin === null,
    })) ?? [{ resourceIds: [], hours: 1, unknown: false }],
    after,
  }
}

/**
 * Finestra per creare o modificare un'attività. Le modifiche vanno nella bozza del grafo:
 * si salvano insieme alle precedenze con "Salva modifiche".
 */
export function ActivityForm(props: ActivityFormProps) {
  const { activity, newId, others, after, resources, skills, onSave, onDelete, onClose } = props
  const isNew = !activity
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(activity, after) })
  const modes = useFieldArray({ control, name: 'modes' })
  const required = useWatch({ control, name: 'requiredSkills' })

  // Risorse adatte: attive e con tutte le competenze richieste
  const suitable = resources.filter(
    (r) => r.active && (required ?? []).every((s) => r.skills.includes(s)),
  )

  const submit = handleSubmit((v) =>
    onSave({
      activity: {
        id: activity?.id ?? newId,
        name: v.name.trim(),
        requiredSkills: v.requiredSkills,
        modes: v.modes.map((m) => ({
          resourceIds: m.resourceIds,
          durationMin: m.unknown || m.hours === null ? null : Math.round(m.hours * 60),
        })),
      },
      after: v.after,
    }),
  )

  const askDelete = () =>
    confirmDialog({
      header: `Togliere ${activity?.name}?`,
      message: 'Spariscono anche le sue precedenze. La modifica vale dopo “Salva modifiche”.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Togli attività',
      rejectLabel: 'Annulla',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: onDelete,
    })

  const footer = (
    <div className={styles.footer}>
      {!isNew && onDelete && (
        <Button
          type="button"
          label="Togli attività"
          icon="pi pi-trash"
          severity="danger"
          text
          className={styles.danger}
          onClick={askDelete}
        />
      )}
      <Button type="button" label="Annulla" outlined onClick={onClose} />
      <Button
        type="submit"
        form="activity-form"
        label={isNew ? 'Aggiungi' : 'Applica'}
        icon="pi pi-check"
      />
    </div>
  )

  return (
    <Dialog
      visible
      onHide={onClose}
      header={isNew ? 'Nuova attività' : `Modifica ${activity.name}`}
      footer={footer}
      className={styles.dialog}
      draggable={false}
      blockScroll
    >
      <form id="activity-form" className={styles.form} onSubmit={submit} noValidate>
        <FormField id="act-name" label="Nome" hint="Es. Sbavatura" error={errors.name?.message}>
          {(aria) => <InputText {...aria} invalid={aria['aria-invalid']} {...register('name')} />}
        </FormField>

        <FormField
          id="act-skills"
          label="Competenze richieste"
          error={errors.requiredSkills?.message}
        >
          {(aria) => (
            <Controller
              control={control}
              name="requiredSkills"
              render={({ field }) => (
                <MultiSelect
                  inputId={aria.id}
                  value={field.value}
                  options={skills}
                  optionLabel="name"
                  optionValue="code"
                  onChange={(e) => field.onChange(e.value)}
                  display="chip"
                  placeholder="Scegli"
                  invalid={aria['aria-invalid']}
                />
              )}
            />
          )}
        </FormField>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Come si può eseguire</legend>
          <p className={styles.hint}>
            Un modo per ogni alternativa: il sistema sceglie quella migliore. Si propongono solo le
            risorse attive con le competenze richieste.
          </p>
          {modes.fields.map((f, i) => (
            <ModeRow
              key={f.id}
              index={i}
              control={control}
              register={register}
              options={suitable}
              errors={errors.modes?.[i]}
              canRemove={modes.fields.length > 1}
              onRemove={() => modes.remove(i)}
            />
          ))}
          {errors.modes?.message && <span className={styles.error}>{errors.modes.message}</span>}
          <Button
            type="button"
            label="Aggiungi alternativa"
            icon="pi pi-plus"
            outlined
            size="small"
            className={styles.add}
            onClick={() => modes.append({ resourceIds: [], hours: 1, unknown: false })}
          />
        </fieldset>

        <FormField
          id="act-after"
          label="Dopo"
          hint="Le attività che devono finire prima che questa possa iniziare."
        >
          {(aria) => (
            <Controller
              control={control}
              name="after"
              render={({ field }) => (
                <MultiSelect
                  inputId={aria.id}
                  value={field.value}
                  options={others}
                  optionLabel="name"
                  optionValue="id"
                  onChange={(e) => field.onChange(e.value)}
                  display="chip"
                  placeholder="Nessuna"
                  emptyMessage="Nessun’altra attività"
                  aria-describedby={aria['aria-describedby']}
                />
              )}
            />
          )}
        </FormField>
      </form>
    </Dialog>
  )
}

type ModeRowProps = {
  index: number
  control: ReturnType<typeof useForm<Values>>['control']
  register: ReturnType<typeof useForm<Values>>['register']
  options: Resource[]
  errors?: { resourceIds?: { message?: string }; hours?: { message?: string } }
  canRemove: boolean
  onRemove: () => void
}

function ModeRow({ index, control, register, options, errors, canRemove, onRemove }: ModeRowProps) {
  const unknown = useWatch({ control, name: `modes.${index}.unknown` })
  return (
    <div className={styles.mode}>
      <FormField
        id={`act-mode-${index}-res`}
        label={`Risorse (alternativa ${index + 1})`}
        error={errors?.resourceIds?.message}
      >
        {(aria) => (
          <Controller
            control={control}
            name={`modes.${index}.resourceIds`}
            render={({ field }) => (
              <MultiSelect
                inputId={aria.id}
                value={field.value}
                options={options}
                optionLabel="name"
                optionValue="id"
                onChange={(e) => field.onChange(e.value)}
                display="chip"
                placeholder="Scegli"
                emptyMessage="Nessuna risorsa ha queste competenze"
                invalid={aria['aria-invalid']}
              />
            )}
          />
        )}
      </FormField>
      <FormField id={`act-mode-${index}-hours`} label="Durata (ore)" error={errors?.hours?.message}>
        {(aria) => (
          <Controller
            control={control}
            name={`modes.${index}.hours`}
            render={({ field }) => (
              <InputNumber
                inputId={aria.id}
                inputRef={field.ref}
                value={unknown ? null : field.value}
                onValueChange={(e) => field.onChange(e.value ?? null)}
                min={0.25}
                max={200}
                step={0.25}
                maxFractionDigits={2}
                locale="it-IT"
                suffix=" h"
                disabled={unknown}
                placeholder={unknown ? 'La stima l’AI' : undefined}
                invalid={aria['aria-invalid']}
              />
            )}
          />
        )}
      </FormField>
      <Button
        type="button"
        icon="pi pi-trash"
        text
        severity="danger"
        aria-label={`Togli l’alternativa ${index + 1}`}
        disabled={!canRemove}
        onClick={onRemove}
        className={styles.remove}
      />
      <label className={styles.unknown}>
        <input type="checkbox" {...register(`modes.${index}.unknown`)} />
        Durata non nota: la stima l’AI dagli storici
      </label>
    </div>
  )
}
