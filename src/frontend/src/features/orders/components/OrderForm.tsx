import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { SelectButton } from 'primereact/selectbutton'
import { Controller, useForm, type FieldPath } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, errorMessage } from '@/api/errors'
import type { Order, OrderInput } from '@/api/types/orders'
import { useToast } from '@/app/toast/toastContext'
import { FormField } from '@/components/FormField'
import { useDomainProfiles } from '@/features/configuration/hooks'
import { useSaveOrder } from '../hooks'
import styles from './orderForm.module.css'

const PRIORITIES = [
  { value: 1, label: 'Bassa' },
  { value: 2, label: 'Media' },
  { value: 3, label: 'Alta' },
]

const schema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[A-Z]+-\d+$/, 'Usa il formato C-105.'),
    customer: z.string().trim().min(1, 'Inserisci il cliente.'),
    description: z.string().trim().min(1, 'Descrivi il lavoro in poche parole.'),
    domainProfile: z.string().min(1, 'Scegli un profilo.'),
    releaseDate: z.date({ error: 'Scegli da quando si può iniziare.' }),
    dueDate: z.date().nullable(),
    priority: z.number({ error: 'Scegli la priorità.' }),
    weight: z
      .number({ error: 'Inserisci il peso.' })
      .min(0.5, 'Almeno 0,5.')
      .max(10, 'Al massimo 10.'),
  })
  .refine((v) => !v.dueDate || v.dueDate > v.releaseDate, {
    path: ['dueDate'],
    message: 'La scadenza deve venire dopo la data di rilascio.',
  })

type Values = z.infer<typeof schema>

/** Il rilascio vale dall'inizio del turno, la scadenza fino alla fine della giornata */
const at = (d: Date, hour: number) => {
  const x = new Date(d)
  x.setHours(hour, 0, 0, 0)
  return x
}

function toValues(order: Order | undefined, defaultProfile: string): Values {
  return {
    id: order?.id ?? 'C-',
    customer: order?.customer ?? '',
    description: order?.description ?? '',
    domainProfile: order?.domainProfile ?? defaultProfile,
    releaseDate: order ? new Date(order.releaseDate) : at(new Date(), 8),
    dueDate: order?.dueDate ? new Date(order.dueDate) : null,
    priority: order?.priority ?? 2,
    weight: order?.weight ?? 1,
  }
}

function toInput(v: Values): OrderInput {
  return {
    ...v,
    id: v.id.trim(),
    releaseDate: at(v.releaseDate, 8).toISOString(),
    dueDate: v.dueDate ? at(v.dueDate, 18).toISOString() : null,
  }
}

type OrderFormProps = {
  /** Assente = nuova commessa */
  order?: Order
  onClose: (saved?: Order) => void
}

/** Finestra per creare una commessa o modificarne i dati (le attività si gestiscono nel grafo) */
export function OrderForm({ order, onClose }: OrderFormProps) {
  const isNew = !order
  const toast = useToast()
  const save = useSaveOrder()
  const { data: profiles = [] } = useDomainProfiles()
  const defaultProfile = profiles.find((p) => p.inUse)?.code ?? 'FACTORY'
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(order, defaultProfile),
  })

  const onSubmit = (v: Values) =>
    save.mutate(
      { input: toInput(v), isNew },
      {
        onSuccess: (saved) => {
          toast.success(
            isNew ? 'Commessa creata' : 'Dati salvati',
            `${saved.id} · ${saved.customer}`,
          )
          onClose(saved)
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 422 && error.errors.length) {
            for (const e of error.errors) {
              setError(e.path as FieldPath<Values>, { message: e.message }, { shouldFocus: true })
            }
          } else {
            toast.error('Salvataggio non riuscito', errorMessage(error))
          }
        },
      },
    )

  const footer = (
    <div className={styles.footer}>
      <Button type="button" label="Annulla" outlined onClick={() => onClose()} />
      <Button
        type="submit"
        form="order-form"
        label={isNew ? 'Crea commessa' : 'Salva dati'}
        icon="pi pi-check"
        loading={save.isPending}
        disabled={!isNew && !isDirty}
      />
    </div>
  )

  return (
    <Dialog
      visible
      onHide={() => onClose()}
      header={isNew ? 'Nuova commessa' : `Modifica ${order.id}`}
      footer={footer}
      className={styles.dialog}
      draggable={false}
      blockScroll
    >
      <form id="order-form" className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={styles.twoCols}>
          <FormField
            id="order-id"
            label="Codice"
            hint={isNew ? 'Es. C-105' : undefined}
            error={errors.id?.message}
          >
            {(aria) => (
              <InputText
                {...aria}
                invalid={aria['aria-invalid']}
                className="mono"
                disabled={!isNew}
                {...register('id')}
              />
            )}
          </FormField>
          <FormField id="order-customer" label="Cliente" error={errors.customer?.message}>
            {(aria) => (
              <InputText {...aria} invalid={aria['aria-invalid']} {...register('customer')} />
            )}
          </FormField>
        </div>

        <FormField
          id="order-description"
          label="Lavoro"
          hint="Es. Telaio carrello"
          error={errors.description?.message}
        >
          {(aria) => (
            <InputText {...aria} invalid={aria['aria-invalid']} {...register('description')} />
          )}
        </FormField>

        <div className={styles.twoCols}>
          <FormField
            id="order-release"
            label="Si può iniziare dal"
            error={errors.releaseDate?.message}
          >
            {(aria) => (
              <Controller
                control={control}
                name="releaseDate"
                render={({ field }) => (
                  <Calendar
                    inputId={aria.id}
                    inputRef={field.ref}
                    value={field.value}
                    onChange={(e) => field.onChange(e.value ?? null)}
                    dateFormat="D d M yy"
                    readOnlyInput
                    showIcon
                    invalid={aria['aria-invalid']}
                    aria-describedby={aria['aria-describedby']}
                  />
                )}
              />
            )}
          </FormField>
          <FormField
            id="order-due"
            label="Scadenza"
            hint="Se manca, il sistema la chiederà prima di pianificare."
            error={errors.dueDate?.message}
          >
            {(aria) => (
              <Controller
                control={control}
                name="dueDate"
                render={({ field }) => (
                  <Calendar
                    inputId={aria.id}
                    inputRef={field.ref}
                    value={field.value}
                    onChange={(e) => field.onChange(e.value ?? null)}
                    dateFormat="D d M yy"
                    readOnlyInput
                    showIcon
                    showButtonBar
                    placeholder="Non ancora nota"
                    invalid={aria['aria-invalid']}
                    aria-describedby={aria['aria-describedby']}
                  />
                )}
              />
            )}
          </FormField>
        </div>

        <div className={styles.twoCols}>
          <div className={styles.group} role="group" aria-labelledby="order-priority-label">
            <span id="order-priority-label" className={styles.groupLabel}>
              Priorità
            </span>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <SelectButton
                  value={field.value}
                  options={PRIORITIES}
                  onChange={(e) => e.value !== null && field.onChange(e.value)}
                  allowEmpty={false}
                  className={styles.priority}
                />
              )}
            />
          </div>
          <FormField
            id="order-weight"
            label="Peso del ritardo"
            hint="Quanto pesa un’ora di ritardo rispetto alle altre commesse."
            error={errors.weight?.message}
          >
            {(aria) => (
              <Controller
                control={control}
                name="weight"
                render={({ field }) => (
                  <InputNumber
                    inputId={aria.id}
                    inputRef={field.ref}
                    value={field.value}
                    onValueChange={(e) => field.onChange(e.value ?? null)}
                    min={0.5}
                    max={10}
                    step={0.5}
                    minFractionDigits={0}
                    maxFractionDigits={1}
                    showButtons
                    locale="it-IT"
                    invalid={aria['aria-invalid']}
                    aria-describedby={aria['aria-describedby']}
                  />
                )}
              />
            )}
          </FormField>
        </div>

        <FormField
          id="order-profile"
          label="Profilo di dominio"
          error={errors.domainProfile?.message}
        >
          {(aria) => (
            <Controller
              control={control}
              name="domainProfile"
              render={({ field }) => (
                <Dropdown
                  inputId={aria.id}
                  focusInputRef={field.ref}
                  value={field.value}
                  options={profiles.map((p) => ({ value: p.code, label: p.name ?? p.code }))}
                  onChange={(e) => field.onChange(e.value)}
                  invalid={aria['aria-invalid']}
                />
              )}
            />
          )}
        </FormField>
      </form>
    </Dialog>
  )
}
