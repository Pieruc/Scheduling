import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { ApiError, errorMessage } from '@/api/errors'
import type { Calendar } from '@/api/types/config'
import { useToast } from '@/app/toast/toastContext'
import { FormField } from '@/components/FormField'
import shared from '../resources/resources.module.css'
import { useSaveCalendar } from '../hooks'
import styles from '../config.module.css'
import {
  calendarSchema,
  toFormValues,
  toInput,
  weeklyHours,
  type CalendarFormValues,
} from './calendarSchema'

const DAYS = [
  { n: 1, short: 'Lun', long: 'lunedì' },
  { n: 2, short: 'Mar', long: 'martedì' },
  { n: 3, short: 'Mer', long: 'mercoledì' },
  { n: 4, short: 'Gio', long: 'giovedì' },
  { n: 5, short: 'Ven', long: 'venerdì' },
  { n: 6, short: 'Sab', long: 'sabato' },
  { n: 7, short: 'Dom', long: 'domenica' },
]

const hours = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

type CalendarFormProps = {
  /** Assente = nuovo calendario */
  calendar?: Calendar
  /** Quante risorse lo usano: le modifiche valgono per tutte */
  usedBy: number
  onSaved: (calendar: Calendar) => void
  onCancel: () => void
}

export function CalendarForm({ calendar, usedBy, onSaved, onCancel }: CalendarFormProps) {
  const isNew = !calendar
  const toast = useToast()
  const save = useSaveCalendar()
  const {
    control,
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<CalendarFormValues>({
    resolver: zodResolver(calendarSchema),
    defaultValues: toFormValues(calendar),
  })
  const shifts = useFieldArray({ control, name: 'shifts' })
  const holidays = useFieldArray({ control, name: 'holidays' })
  const watched = useWatch({ control })
  const total = weeklyHours({
    workDays: watched.workDays ?? [],
    shifts: (watched.shifts ?? []).map((s) => ({ start: s?.start ?? '', end: s?.end ?? '' })),
  })

  const onSubmit = (values: CalendarFormValues) =>
    save.mutate(
      { input: toInput(values), id: calendar?.id },
      {
        onSuccess: (saved) => {
          toast.success(isNew ? 'Calendario creato' : 'Modifiche salvate', saved.name)
          reset(toFormValues(saved))
          onSaved(saved)
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 422 && error.errors.length) {
            for (const e of error.errors) {
              const path = e.path.replace(/\[(\d+)\]/g, '.$1') as FieldPath<CalendarFormValues>
              setError(path, { message: e.message })
            }
          } else {
            toast.error('Salvataggio non riuscito', errorMessage(error))
          }
        },
      },
    )

  return (
    <form className={shared.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className={shared.formTitle}>{isNew ? 'Nuovo calendario' : calendar.name}</h2>
      {!isNew && usedBy > 0 && (
        <p className={shared.hint}>
          Lo usano {usedBy === 1 ? '1 risorsa' : `${usedBy} risorse`}: le modifiche valgono per i
          prossimi piani di tutte.
        </p>
      )}

      <FormField id="cal-name" label="Nome" error={errors.name?.message}>
        {(aria) => <InputText {...aria} invalid={aria['aria-invalid']} {...register('name')} />}
      </FormField>

      <fieldset
        className={shared.fieldset}
        aria-describedby={errors.workDays ? 'cal-days-error' : undefined}
      >
        <legend className={shared.legend}>Giorni lavorativi</legend>
        <Controller
          control={control}
          name="workDays"
          render={({ field }) => (
            <div className={styles.days}>
              {DAYS.map((d, i) => (
                <label key={d.n} className={styles.day}>
                  <input
                    type="checkbox"
                    ref={i === 0 ? field.ref : undefined}
                    checked={field.value.includes(d.n)}
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked
                          ? [...field.value, d.n]
                          : field.value.filter((x) => x !== d.n),
                      )
                    }
                    aria-label={d.long}
                  />
                  <span aria-hidden="true">{d.short}</span>
                </label>
              ))}
            </div>
          )}
        />
        {errors.workDays && (
          <small id="cal-days-error" className={styles.error}>
            {errors.workDays.message}
          </small>
        )}
      </fieldset>

      <fieldset className={shared.fieldset}>
        <legend className={shared.legend}>Turni di ogni giorno lavorativo</legend>
        {shifts.fields.map((f, i) => (
          <div key={f.id} className={styles.shiftRow}>
            <FormField
              id={`cal-shift-${i}-start`}
              label={`Inizio turno ${i + 1}`}
              error={errors.shifts?.[i]?.start?.message}
            >
              {(aria) => (
                <InputText
                  {...aria}
                  type="time"
                  invalid={aria['aria-invalid']}
                  {...register(`shifts.${i}.start`)}
                />
              )}
            </FormField>
            <FormField
              id={`cal-shift-${i}-end`}
              label={`Fine turno ${i + 1}`}
              error={errors.shifts?.[i]?.end?.message}
            >
              {(aria) => (
                <InputText
                  {...aria}
                  type="time"
                  invalid={aria['aria-invalid']}
                  {...register(`shifts.${i}.end`)}
                />
              )}
            </FormField>
            <Button
              type="button"
              icon="pi pi-trash"
              text
              severity="danger"
              aria-label={`Togli il turno ${i + 1}`}
              disabled={shifts.fields.length === 1}
              onClick={() => shifts.remove(i)}
              className={styles.remove}
            />
          </div>
        ))}
        {errors.shifts?.message && <small className={styles.error}>{errors.shifts.message}</small>}
        <div className={styles.fieldsetFoot}>
          {shifts.fields.length < 3 && (
            <Button
              type="button"
              label="Aggiungi turno"
              icon="pi pi-plus"
              outlined
              size="small"
              className={styles.add}
              onClick={() => shifts.append({ start: '13:00', end: '17:00' })}
            />
          )}
          <span className={styles.total} aria-live="polite">
            {hours.format(total)} h a settimana
          </span>
        </div>
      </fieldset>

      <fieldset className={shared.fieldset}>
        <legend className={shared.legend}>Festività e chiusure</legend>
        {holidays.fields.length === 0 && <p className={shared.muted}>Nessuna chiusura.</p>}
        {holidays.fields.map((f, i) => (
          <div key={f.id} className={`${styles.shiftRow} ${styles.holidayRow}`}>
            <FormField
              id={`cal-hol-${i}-date`}
              label="Data"
              error={errors.holidays?.[i]?.date?.message}
            >
              {(aria) => (
                <InputText
                  {...aria}
                  type="date"
                  invalid={aria['aria-invalid']}
                  {...register(`holidays.${i}.date`)}
                />
              )}
            </FormField>
            <FormField
              id={`cal-hol-${i}-name`}
              label="Nome"
              error={errors.holidays?.[i]?.name?.message}
            >
              {(aria) => (
                <InputText
                  {...aria}
                  invalid={aria['aria-invalid']}
                  {...register(`holidays.${i}.name`)}
                />
              )}
            </FormField>
            <Button
              type="button"
              icon="pi pi-trash"
              text
              severity="danger"
              aria-label={`Togli la chiusura ${i + 1}`}
              onClick={() => holidays.remove(i)}
              className={styles.remove}
            />
          </div>
        ))}
        <div>
          <Button
            type="button"
            label="Aggiungi chiusura"
            icon="pi pi-plus"
            outlined
            size="small"
            className={styles.add}
            onClick={() => holidays.append({ date: '', name: '' })}
          />
        </div>
      </fieldset>

      <div className={shared.actions}>
        <Button
          type="submit"
          label={isNew ? 'Crea calendario' : 'Salva modifiche'}
          loading={save.isPending}
          disabled={!isNew && !isDirty}
        />
        <Button type="button" label="Annulla" outlined onClick={onCancel} />
      </div>
    </form>
  )
}
