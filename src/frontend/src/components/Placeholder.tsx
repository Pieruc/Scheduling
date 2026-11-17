import styles from './Placeholder.module.css'

/** Riquadro temporaneo per le pagine non ancora sviluppate. Da rimuovere man mano. */
export function Placeholder({ screen }: { screen: string }) {
  return (
    <div className={styles.box}>
      <i className="pi pi-wrench" aria-hidden="true" />
      <span>
        Pagina in costruzione · riferimento: mockup v2, schermata <b>{screen}</b>
      </span>
    </div>
  )
}
