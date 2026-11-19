import { Button } from 'primereact/button'
import { InputTextarea } from 'primereact/inputtextarea'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import type { Interpretation } from '@/api/types/plans'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { PipelineSteps, type Step } from '@/components/PipelineSteps'
import { InterpretationForm } from './components/InterpretationForm'
import { useInterpretRequest } from './hooks'
import styles from './components/planning.module.css'

const EXAMPLE =
  'Pianifica da domani a martedì le commesse C-101, C-102, C-103 e C-104. ' +
  'La C-101 va consegnata entro venerdì. La fresa 2 è ferma giovedì per manutenzione. ' +
  'Se possibile evitiamo gli straordinari.'

/** Mockup v2, schermata 3. */
export function NewPlanPage() {
  const [text, setText] = useState('')
  const interpret = useInterpretRequest()
  const [result, setResult] = useState<{ text: string; data: Interpretation; n: number } | null>(
    null,
  )
  const [unanswered, setUnanswered] = useState(0)

  const textError =
    interpret.error instanceof ApiError
      ? interpret.error.errors.find((e) => e.path === 'text')?.message
      : undefined

  const onInterpret = () =>
    interpret.mutate(text, {
      onSuccess: (data) => {
        setResult((prev) => ({ text, data, n: (prev?.n ?? 0) + 1 }))
        setUnanswered(data.missingData.length)
      },
    })

  const steps: Step[] = [
    {
      label: '1 · LLM',
      title: result ? 'Richiesta capita' : 'Leggo la richiesta',
      state: result ? 'done' : interpret.isPending ? 'current' : 'todo',
    },
    {
      label: '2 · Validazione',
      title: !result
        ? 'Controllo dei dati'
        : unanswered > 0
          ? `${unanswered} ${unanswered === 1 ? 'dato mancante' : 'dati mancanti'}`
          : 'Dati completi',
      state: !result ? 'todo' : unanswered > 0 ? 'warn' : 'done',
    },
    { label: '3 · M1', title: 'Stima delle durate', state: 'todo' },
    { label: '4 · M2', title: 'Costruzione dei piani', state: 'todo' },
    { label: '5 · Confronto', title: 'AI contro ATC ed EDD', state: 'todo' },
  ]

  return (
    <>
      <PageHeader
        title="Nuova pianificazione"
        subtitle="Descrivi cosa ti serve: il sistema lo traduce, controlla i dati e prepara 3 piani alternativi."
      />
      <PipelineSteps steps={steps} label="Fasi della pianificazione" />

      <div className={`${styles.layout} ${result ? styles.twoColumns : ''}`}>
        <Card title="La tua richiesta" className={result ? styles.stickyCard : undefined}>
          <FormField
            id="plan-text"
            label="Scrivi come lo diresti a un collega"
            error={textError}
            hint="Commesse, periodo, scadenze, macchine ferme, cosa preferisci evitare."
          >
            {(aria) => (
              <InputTextarea
                {...aria}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                autoResize
                invalid={aria['aria-invalid']}
              />
            )}
          </FormField>
          {interpret.isError && !textError && (
            <ErrorState error={interpret.error} onRetry={onInterpret} />
          )}
          <div className={styles.actions}>
            <Button
              label={result ? 'Interpreta di nuovo' : 'Interpreta'}
              icon="pi pi-sparkles"
              loading={interpret.isPending}
              disabled={!text.trim()}
              onClick={onInterpret}
            />
            {!text && <Button label="Usa un esempio" outlined onClick={() => setText(EXAMPLE)} />}
            {text && !interpret.isPending && (
              <Button
                label="Cancella"
                outlined
                onClick={() => {
                  setText('')
                  setResult(null)
                  interpret.reset()
                }}
              />
            )}
          </div>
          {result && text !== result.text && (
            <p className={styles.note} role="status">
              Hai cambiato il testo: premi “Interpreta di nuovo” per aggiornare i dati a destra.
            </p>
          )}
        </Card>

        {!result && (
          <Card title="Cosa riceverai" className={styles.preview}>
            <p className={styles.muted}>
              Tre piani che rispettano tutti i vincoli, con compromessi diversi tra tempo e costo:
            </p>
            <ul className={styles.variants}>
              <li>
                <strong>A · Economico</strong>: il più lento, costo minimo, niente straordinari.
              </li>
              <li>
                <strong>B · Bilanciato</strong>: il compromesso guidato dai pesi che scegli.
              </li>
              <li>
                <strong>C · Veloce</strong>: chiude prima, ma usa straordinari e costa di più.
              </li>
            </ul>
            <p className={styles.muted}>
              Ogni richiesta viene confrontata anche con le regole classiche ATC ed EDD, per vedere
              quanto aggiunge l’AI. Nessun piano viene applicato finché non lo approvi.
            </p>
          </Card>
        )}

        {result && (
          <InterpretationForm
            // Ogni nuova interpretazione riparte dai suoi valori
            key={result.n}
            text={result.text}
            interpretation={result.data}
            onUnansweredChange={setUnanswered}
          />
        )}
      </div>
    </>
  )
}
