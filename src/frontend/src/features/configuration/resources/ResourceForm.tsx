import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { confirmDialog } from 'primereact/confirmdialog'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { MultiSelect } from 'primereact/multiselect'
import { Controller, useFieldArray, useForm, type FieldPath } from 'react-hook-form'
import { ApiError, errorMessage } from '@/api/errors'
import type { Resource } from '@/api/types/config'
import { useToast } from '@/app/toast/toastContext'
import { FormField } from '@/components/FormField'
import { RESOURCE_TYPE_LABEL } from '@/lib/labels'
import { useCalendars, useDeactivateResource, useSaveResource, useSkills } from '../hooks'
import { resourceSchema, toFormValues, toInput, type ResourceFormValues } from './resourceSchema'
import styles from './resources.module.css'

const TYPE_OPTIONS = Object.entries(RESOURCE_TYPE_LABEL).map(([value, label]) => ({ value, label }))

type ResourceFormProps = {
  /** Assente = nuova risorsa */
  resource?: Resource
  onSaved: (resource: Resource) => void
  onCancel: () => void
}

export function ResourceForm({ resource, onSaved, onCancel }: ResourceFormProps) {
  const isNew = !resource
  const toast = useToast()
  const save = useSaveResource()
  const deactivate = useDeactivateResource()
  const { data: skills = [] } = useSkills()
  const { data: calendars = [] } = useCalendars()

  const {
    control,
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceSchema),
    defaultValues: toFormValues(resource),
  })
  const unavailability = useFieldArray({ control, name: 'unavailability' })

  const onSubmit = (values: ResourceFormValues) =>
    save.mutate(
      { input: toInput(values), isNew },
      {
        onSuccess: (saved) => {
          toast.success(isNew ? 'Risorsa creata' : 'Modifiche salvate', saved.name)
          reset(toFormValues(saved))
          onSaved(saved)
        },
        onError: (error) => {
          // Gli errori di validazione del backend vanno sotto il campo a cui si riferiscono.
          if (error instanceof ApiError && error.status === 422 && error.errors.length) {
            for (const e of error.errors) {
              const path = e.path.replace(/\[(\d+)\]/g, '.$1') as FieldPath<ResourceFormValues>
              setError(path, { message: e.message })
            }
          } else {
            toast.error('Salvataggio non riuscito', errorMessage(error))
          }
        },
      },
    )

  const askDeactivate = () => {
    if (!resource) return
    confirmDialog({
      header: 'Disattivare la risorsa?',
      message: `${resource.name} non verrà più usata nei nuovi piani. I piani già approvati non cambiano.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Disattiva',
      rejectLabel: 'Annulla',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: () =>
        deactivate.mutate(resource.id, {
          onSuccess: () => toast.success('Risorsa disattivata', resource.name),
          onError: (error) => toast.error('Disattivazione non riuscita', errorMessage(error)),
        }),
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className={styles.formTitle}>{isNew ? 'Nuova risorsa' : resource.name}</h2>

      <div className={styles.twoCols}>
        <FormField
          id="res-id"
          label="Codice"
          error={errors.id?.message}
          hint={isNew ? 'Es. R-CNC-03' : undefined}
        >
          {(aria) => (
            <InputText
              {...aria}
              invalid={aria['aria-invalid']}
              {...register('id')}
              disabled={!isNew}
              className="mono"
            />
          )}
        </FormField>
        <FormField id="res-type" label="Tipo" error={errors.type?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Dropdown
                  inputId={aria.id}
                  value={field.value}
                  options={TYPE_OPTIONS}
                  onChange={(e) => field.onChange(e.value)}
                  onBlur={field.onBlur}
                />
              )}
            />
          )}
        </FormField>
      </div>

      <FormField id="res-name" label="Nome" error={errors.name?.message}>
        {(aria) => <InputText {...aria} invalid={aria['aria-invalid']} {...register('name')} />}
      </FormField>

      <FormField id="res-skills" label="Competenze" error={errors.skills?.message}>
        {(aria) => (
          <Controller
            control={control}
            name="skills"
            render={({ field }) => (
              <MultiSelect
                inputId={aria.id}
                value={field.value}
                options={skills}
                optionLabel="name"
                optionValue="code"
                display="chip"
                placeholder="Scegli le competenze"
                invalid={aria['aria-invalid']}
                onChange={(e) => field.onChange(e.value)}
                onBlur={field.onBlur}
              />
            )}
          />
        )}
      </FormField>

      <div className={styles.twoCols}>
        <FormField id="res-calendar" label="Calendario" error={errors.calendarId?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="calendarId"
              render={({ field }) => (
                <Dropdown
                  inputId={aria.id}
                  value={field.value}
                  options={calendars}
                  optionLabel="name"
                  optionValue="id"
                  itemTemplate={(c: (typeof calendars)[number]) => (
                    <div>
                      <div>{c.name}</div>
                      <small className={styles.muted}>{c.shiftsSummary}</small>
                    </div>
                  )}
                  invalid={aria['aria-invalid']}
                  onChange={(e) => field.onChange(e.value)}
                  onBlur={field.onBlur}
                />
              )}
            />
          )}
        </FormField>
        <FormField id="res-cost" label="Costo orario" error={errors.costPerHour?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="costPerHour"
              render={({ field }) => (
                <InputNumber
                  inputId={aria.id}
                  value={field.value}
                  mode="currency"
                  currency="EUR"
                  locale="it-IT"
                  maxFractionDigits={0}
                  min={0}
                  invalid={aria['aria-invalid']}
                  onValueChange={(e) => field.onChange(e.value ?? null)}
                  onBlur={field.onBlur}
                />
              )}
            />
          )}
        </FormField>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Indisponibilità programmate</legend>
        {unavailability.fields.length === 0 && (
          <p className={styles.muted}>Nessuna indisponibilità programmata.</p>
        )}
        {unavailability.fields.map((item, index) => {
          const rowErrors = errors.unavailability?.[index]
          return (
            <div key={item.id} className={styles.unavailability}>
              <div className={styles.dates}>
                {(['from', 'to'] as const).map((part) => (
                  <FormField
                    key={part}
                    id={`res-un-${index}-${part}`}
                    label={part === 'from' ? 'Dalle' : 'Alle'}
                    error={rowErrors?.[part]?.message}
                  >
                    {(aria) => (
                      <Controller
                        control={control}
                        name={`unavailability.${index}.${part}`}
                        render={({ field }) => (
                          <Calendar
                            inputId={aria.id}
                            value={field.value}
                            onChange={(e) => field.onChange(e.value)}
                            showTime
                            hourFormat="24"
                            dateFormat="dd/mm/yy"
                            stepMinute={15}
                            invalid={aria['aria-invalid']}
                          />
                        )}
                      />
                    )}
                  </FormField>
                ))}
              </div>
              <div className={styles.reasonRow}>
                <FormField
                  id={`res-un-${index}-reason`}
                  label="Motivo"
                  error={rowErrors?.reason?.message}
                >
                  {(aria) => (
                    <InputText
                      {...aria}
                      invalid={aria['aria-invalid']}
                      {...register(`unavailability.${index}.reason`)}
                    />
                  )}
                </FormField>
                <Button
                  type="button"
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  aria-label={`Togli l’indisponibilità ${index + 1}`}
                  onClick={() => unavailability.remove(index)}
                />
              </div>
            </div>
          )
        })}
        <div>
          <Button
            type="button"
            label="Aggiungi indisponibilità"
            icon="pi pi-plus"
            outlined
            size="small"
            onClick={() =>
              unavailability.append({
                from: undefined as unknown as Date,
                to: undefined as unknown as Date,
                reason: 'Manutenzione',
              })
            }
          />
        </div>
      </fieldset>

      <div className={styles.actions}>
        <Button
          type="submit"
          label={isNew ? 'Crea risorsa' : 'Salva modifiche'}
          loading={save.isPending}
          disabled={!isNew && !isDirty}
        />
        <Button type="button" label="Annulla" outlined onClick={onCancel} />
        {!isNew && resource.active && (
          <Button
            type="button"
            label="Disattiva"
            severity="danger"
            text
            className={styles.pushRight}
            loading={deactivate.isPending}
            onClick={askDeactivate}
          />
        )}
      </div>
    </form>
  )
}
