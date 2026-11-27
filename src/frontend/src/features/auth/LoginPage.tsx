import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Password } from 'primereact/password'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router'
import { z } from 'zod'
import { ApiError, errorMessage } from '@/api/errors'
import { FormField } from '@/components/FormField'
import { Logo } from '@/components/Logo'
import { isMocked } from '@/lib/mockMode'
import { useAuth } from './authContext'
import { can, homeOf } from './permissions'
import styles from './auth.module.css'

/** Login simulato dal mock: lì i campi vuoti entrano come pianificatore (scorciatoia di sviluppo) */
const MOCK_AUTH = isMocked('auth')

const schema = MOCK_AUTH
  ? z.object({ username: z.string().trim(), password: z.string() })
  : z.object({
      username: z.string().trim().min(1, 'Inserisci il nome utente.'),
      password: z.string().min(1, 'Inserisci la password.'),
    })
type Values = z.infer<typeof schema>

/** In sviluppo mostriamo gli account di prova (uguali nel mock e nel database di sviluppo) */
const DEV = import.meta.env.DEV

/** Il motivo per cui il login non è riuscito, in parole (codici del backend, contratto A.1) */
function loginFailure(error: unknown) {
  if (error instanceof ApiError) {
    const code = error.errors[0]?.code
    if (code === 'ACCOUNT_PENDING') {
      return 'Il tuo account aspetta ancora l’approvazione di un amministratore.'
    }
    if (code === 'ACCOUNT_DISABLED') {
      return 'Il tuo account è stato disattivato. Chiedi a un amministratore di riattivarlo.'
    }
    if (error.status === 401) return 'Nome utente o password errati.'
  }
  return errorMessage(error)
}

/** Mockup v2, schermata 0: /login. Login di prova, senza rinnovo del token */
export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location } | null)?.from
  const [failure, setFailure] = useState<string | null>(null)
  const {
    control,
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  })

  useEffect(() => setFocus('username'), [setFocus])

  if (user) return <Navigate to={homeOf(user)} replace />

  const onSubmit = async (v: Values) => {
    setFailure(null)
    try {
      const logged = await login(v.username, v.password)
      // Si torna alla pagina richiesta, se il ruolo la permette
      const back = from && from.pathname !== '/login' ? from : null
      const allowed =
        back &&
        (back.pathname.startsWith('/operatore') ? can(logged, 'operator') : can(logged, 'office'))
      navigate(allowed ? back : homeOf(logged), { replace: true })
    } catch (error) {
      setFailure(loginFailure(error))
      setValue('password', '')
      setFocus('password')
    }
  }

  return (
    <div className={styles.page}>
      <title>Accedi · FlowSync</title>
      <main className={styles.card}>
        <Logo />
        <div>
          <h1 className={styles.title}>Accedi</h1>
          <p className={styles.subtitle}>Pianificazione della produzione assistita da AI</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField id="login-username" label="Nome utente" error={errors.username?.message}>
            {(aria) => (
              <InputText
                {...aria}
                invalid={aria['aria-invalid']}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                {...register('username')}
              />
            )}
          </FormField>
          <FormField id="login-password" label="Password" error={errors.password?.message}>
            {(aria) => (
              <Controller
                control={control}
                name="password"
                render={({ field }) => (
                  <Password
                    inputId={aria.id}
                    inputRef={field.ref}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    feedback={false}
                    toggleMask
                    autoComplete="current-password"
                    invalid={aria['aria-invalid']}
                    aria-describedby={aria['aria-describedby']}
                    className={styles.password}
                    inputClassName={styles.passwordInput}
                  />
                )}
              />
            )}
          </FormField>

          {failure && (
            <p className={styles.error} role="alert">
              <i className="pi pi-exclamation-circle" aria-hidden="true" /> {failure}
            </p>
          )}

          <Button type="submit" label="Accedi" loading={isSubmitting} className={styles.submit} />
        </form>

        <p className={styles.footnote}>
          Non hai un account? <Link to="/registrazione">Registrati</Link>: un amministratore
          approverà la richiesta e ti assegnerà il ruolo.
        </p>

        {DEV && (
          <p className={styles.demo}>
            Account di prova: <strong>pianificatore</strong>, <strong>operatore</strong>,{' '}
            <strong>amministratore</strong>, password <strong>demo</strong>.
            {MOCK_AUTH && ' Con il backend finto puoi anche lasciare i campi vuoti.'}
          </p>
        )}
      </main>
    </div>
  )
}
