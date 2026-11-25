import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Password } from 'primereact/password'
import { useEffect, useState } from 'react'
import { Controller, useForm, type FieldPath } from 'react-hook-form'
import { Link, Navigate } from 'react-router'
import { z } from 'zod'
import { register } from '@/api/auth'
import { ApiError, errorMessage } from '@/api/errors'
import { FormField } from '@/components/FormField'
import { Logo } from '@/components/Logo'
import { useAuth } from './authContext'
import { homeOf } from './permissions'
import styles from './auth.module.css'

/** Stesse regole del backend (RegisterRequest), con i messaggi in italiano */
const schema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, 'Inserisci nome e cognome.')
      .max(120, 'Al massimo 120 caratteri.'),
    username: z
      .string()
      .trim()
      .min(3, 'Almeno 3 caratteri.')
      .max(50, 'Al massimo 50 caratteri.')
      .regex(/^[A-Za-z0-9._-]+$/, 'Solo lettere, numeri e . _ - (senza spazi).'),
    email: z.string().trim().email('Indirizzo email non valido.').max(120),
    password: z
      .string()
      .min(8, 'Almeno 8 caratteri.')
      // BCrypt usa al massimo 72 byte: le lettere accentate ne occupano due
      .refine((p) => new TextEncoder().encode(p).length <= 72, 'Password troppo lunga.'),
    confirm: z.string(),
  })
  .refine((v) => v.confirm === v.password, {
    path: ['confirm'],
    message: 'Le due password non coincidono.',
  })

type Values = z.infer<typeof schema>

/** Codici di conflitto del backend -> campo a cui si riferiscono */
const CONFLICT_FIELD: Record<string, FieldPath<Values>> = {
  DUPLICATE_USERNAME: 'username',
  DUPLICATE_EMAIL: 'email',
  PASSWORD_TOO_LONG: 'password',
}

/** /registrazione: chiunque può chiedere un account; lo approva un amministratore */
export function RegisterPage() {
  const { user } = useAuth()
  const [sent, setSent] = useState<string | null>(null)
  const mutation = useMutation({ mutationFn: register })
  const {
    control,
    register: field,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', username: '', email: '', password: '', confirm: '' },
  })

  useEffect(() => setFocus('fullName'), [setFocus])

  if (user) return <Navigate to={homeOf(user)} replace />

  const onSubmit = (v: Values) =>
    mutation.mutate(
      {
        fullName: v.fullName.trim(),
        username: v.username.trim(),
        email: v.email.trim(),
        password: v.password,
      },
      {
        onSuccess: (res) => setSent(res.username),
        onError: (error) => {
          if (!(error instanceof ApiError)) return
          // Errori legati a un campo: sotto il campo, con il fuoco sul primo
          let first: FieldPath<Values> | null = null
          for (const e of error.errors) {
            const name = CONFLICT_FIELD[e.code] ?? (e.path as FieldPath<Values>)
            if (!name || !(name in schema.shape)) continue
            setError(name, { message: e.message })
            first ??= name
          }
          if (first) setFocus(first)
        },
      },
    )

  const passwordField = (name: 'password' | 'confirm', label: string, hint?: string) => (
    <FormField id={`reg-${name}`} label={label} hint={hint} error={errors[name]?.message}>
      {(aria) => (
        <Controller
          control={control}
          name={name}
          render={({ field: f }) => (
            <Password
              inputId={aria.id}
              inputRef={f.ref}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              onBlur={f.onBlur}
              feedback={false}
              toggleMask
              autoComplete="new-password"
              invalid={aria['aria-invalid']}
              aria-describedby={aria['aria-describedby']}
              className={styles.password}
              inputClassName={styles.passwordInput}
            />
          )}
        />
      )}
    </FormField>
  )

  return (
    <div className={styles.page}>
      <title>Registrazione · FlowSync</title>
      <main className={styles.card}>
        <Logo />
        {sent ? (
          <div className={styles.sent} role="status">
            <h1 className={styles.title}>Richiesta inviata</h1>
            <p>
              L’account <strong>{sent}</strong> è stato creato ed è <strong>in attesa</strong>: un
              amministratore deve approvarlo e assegnarti il ruolo (pianificatore, operatore o
              amministratore). Dopo l’approvazione potrai accedere con la password che hai scelto.
            </p>
            <Link to="/login" className={`p-button ${styles.submit}`}>
              Vai all’accesso
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className={styles.title}>Crea un account</h1>
              <p className={styles.subtitle}>
                Il ruolo lo assegna un amministratore quando approva la richiesta.
              </p>
            </div>
            <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
              <FormField id="reg-fullName" label="Nome e cognome" error={errors.fullName?.message}>
                {(aria) => (
                  <InputText
                    {...aria}
                    invalid={aria['aria-invalid']}
                    autoComplete="name"
                    {...field('fullName')}
                  />
                )}
              </FormField>
              <FormField
                id="reg-username"
                label="Nome utente"
                hint="Lettere, numeri e . _ - ; almeno 3 caratteri."
                error={errors.username?.message}
              >
                {(aria) => (
                  <InputText
                    {...aria}
                    invalid={aria['aria-invalid']}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    {...field('username')}
                  />
                )}
              </FormField>
              <FormField id="reg-email" label="Email" error={errors.email?.message}>
                {(aria) => (
                  <InputText
                    {...aria}
                    type="email"
                    invalid={aria['aria-invalid']}
                    autoComplete="email"
                    {...field('email')}
                  />
                )}
              </FormField>
              {passwordField('password', 'Password', 'Almeno 8 caratteri.')}
              {passwordField('confirm', 'Ripeti la password')}

              {mutation.isError &&
                !(
                  mutation.error instanceof ApiError &&
                  mutation.error.errors.some(
                    (e) => CONFLICT_FIELD[e.code] || (e.path && e.path in schema.shape),
                  )
                ) && (
                  <p className={styles.error} role="alert">
                    <i className="pi pi-exclamation-circle" aria-hidden="true" />{' '}
                    {errorMessage(mutation.error)}
                  </p>
                )}

              <Button
                type="submit"
                label="Invia la richiesta"
                loading={mutation.isPending}
                className={styles.submit}
              />
            </form>
            <p className={styles.footnote}>
              Hai già un account? <Link to="/login">Accedi</Link>.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
