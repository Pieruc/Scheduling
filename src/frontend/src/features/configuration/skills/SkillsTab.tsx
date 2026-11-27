import { useCan } from '@/features/auth/authContext'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Skeleton } from 'primereact/skeleton'
import { useForm, type FieldPath } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, errorMessage } from '@/api/errors'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { FormField } from '@/components/FormField'
import { useCreateSkill, useResources, useSkills } from '../hooks'
import styles from '../config.module.css'
import own from './skills.module.css'

const schema = z.object({
  name: z.string().trim().min(1, 'Inserisci un nome.'),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Maiuscole, numeri e _ (es. TORNITURA).'),
})
type Values = z.infer<typeof schema>

/** "Pezzi grandi" -> "PEZZI_GRANDI": il codice proposto finché non lo si scrive a mano */
const codeFrom = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

/** Configurazione → Competenze: cosa sa fare ogni risorsa, richiesto dalle attività */
export function SkillsTab() {
  const skills = useSkills()
  const resources = useResources()
  const create = useCreateSkill()
  const canWrite = useCan('configWrite')
  const toast = useToast()
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    getFieldState,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', code: '' } })

  const onSubmit = (v: Values) => {
    if (skills.data?.some((s) => s.code === v.code)) {
      setError('code', { message: `Il codice ${v.code} esiste già.` }, { shouldFocus: true })
      return
    }
    create.mutate(v, {
      onSuccess: (saved) => {
        toast.success('Competenza aggiunta', saved.name)
        reset({ name: '', code: '' })
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 422 && error.errors.length) {
          for (const e of error.errors)
            setError(e.path as FieldPath<Values>, { message: e.message })
        } else {
          toast.error('Competenza non aggiunta', errorMessage(error))
        }
      },
    })
  }

  const holders = (code: string) =>
    resources.data?.filter((r) => r.active && r.skills.includes(code)) ?? []

  return (
    <div className={canWrite ? own.layout : undefined}>
      {canWrite && (
        <Card title="Nuova competenza" className={own.formCard}>
          <form className={own.form} onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormField id="skill-name" label="Nome" error={errors.name?.message}>
              {(aria) => (
                <InputText
                  {...aria}
                  invalid={aria['aria-invalid']}
                  placeholder="Es. Tornitura"
                  {...register('name', {
                    // Finché il codice non è stato toccato, lo ricaviamo dal nome
                    onChange: (e) => {
                      if (!getFieldState('code').isDirty) {
                        setValue('code', codeFrom(e.target.value))
                      }
                    },
                  })}
                />
              )}
            </FormField>
            <FormField
              id="skill-code"
              label="Codice"
              hint="Lo usano commesse e risorse: non si può cambiare dopo."
              error={errors.code?.message}
            >
              {(aria) => (
                <InputText
                  {...aria}
                  invalid={aria['aria-invalid']}
                  className="mono"
                  {...register('code', {
                    onChange: (e) =>
                      setValue('code', e.target.value.toUpperCase(), { shouldDirty: true }),
                  })}
                />
              )}
            </FormField>
            <Button type="submit" label="Aggiungi" icon="pi pi-plus" loading={create.isPending} />
          </form>
        </Card>
      )}

      <Card title="Competenze" className={own.listCard}>
        {skills.isPending && <Skeleton height="240px" />}
        {skills.isError && <ErrorState error={skills.error} onRetry={() => skills.refetch()} />}
        {skills.data && (
          <table className={styles.table}>
            <caption className="visually-hidden">Competenze e risorse che le hanno</caption>
            <thead>
              <tr>
                <th scope="col">Competenza</th>
                <th scope="col">Risorse attive che la hanno</th>
              </tr>
            </thead>
            <tbody>
              {skills.data.map((s) => {
                const list = holders(s.code)
                return (
                  <tr key={s.code}>
                    <th scope="row">
                      <span className={styles.rowTitle}>{s.name}</span>
                      <br />
                      <span className={`mono ${styles.rowCode}`}>{s.code}</span>
                    </th>
                    <td data-label="Risorse">
                      {!resources.data ? (
                        '…'
                      ) : list.length === 0 ? (
                        <span className={own.warning}>
                          <i className="pi pi-exclamation-triangle" aria-hidden="true" /> Nessuna:
                          le attività che la richiedono non si possono pianificare
                        </span>
                      ) : (
                        list.map((r) => (
                          <span key={r.id} className={styles.chip}>
                            {r.name}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
