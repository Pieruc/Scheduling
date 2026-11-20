/** Filtro di periodo condiviso dagli elenchi (piani, audit) */

/** Periodo in giorni, oppure tutto lo storico */
export type PeriodFilter = '7' | '30' | '90' | 'all'

export const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: '7', label: 'Ultimi 7 giorni' },
  { value: '30', label: 'Ultimi 30 giorni' },
  { value: '90', label: 'Ultimi 90 giorni' },
  { value: 'all', label: 'Tutto lo storico' },
]

export const DEFAULT_PERIOD: PeriodFilter = '30'
