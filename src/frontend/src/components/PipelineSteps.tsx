import styles from './PipelineSteps.module.css'

export type StepState = 'done' | 'current' | 'warn' | 'todo'

export type Step = {
  /** "1 · LLM" */
  label: string
  /** "Richiesta capita" */
  title: string
  state: StepState
}

const ICON: Record<StepState, string> = {
  done: 'pi pi-check',
  current: 'pi pi-spin pi-spinner',
  warn: 'pi pi-exclamation-circle',
  todo: 'pi pi-circle',
}

const STATE_TEXT: Record<StepState, string> = {
  done: 'fatto',
  current: 'in corso',
  warn: 'da completare',
  todo: 'da fare',
}

/** Le fasi della pianificazione: LLM, validazione, M1, M2, confronto. Colore + icona + testo. */
export function PipelineSteps({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className={styles.steps} aria-label={label}>
      {steps.map((s) => (
        <li
          key={s.label}
          className={`${styles.step} ${styles[s.state]}`}
          aria-current={s.state === 'current' ? 'step' : undefined}
        >
          <span className={styles.head}>
            <i className={ICON[s.state]} aria-hidden="true" />
            {s.label}
          </span>
          <span className={styles.title}>{s.title}</span>
          <span className="visually-hidden">: {STATE_TEXT[s.state]}</span>
        </li>
      ))}
    </ol>
  )
}
