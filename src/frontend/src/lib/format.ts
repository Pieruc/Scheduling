/** Formati all'italiana usati in tutta l'app. */

/**
 * Ore di una "giornata" nelle durate dei piani: due turni da 4 h.
 * Ipotesi da confermare con backend e AI (FRONTEND_STRUTTURA §8).
 */
export const WORKDAY_HOURS = 8

const percent = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 0 })
const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  // In italiano Intl non separa le migliaia sotto 10.000 ("9600 €"): lo forziamo ("9.600 €")
  useGrouping: 'always',
})
const time = new Intl.DateTimeFormat('it-IT', { hour: 'numeric', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })

/** 0.78 -> "78%" */
export const formatPercent = (value: number) => percent.format(value)

/** 9600 -> "9.600 €" */
export const formatEuro = (value: number) => euro.format(value)

/** Minuti di lavoro -> "4 g 6 h", "6 h", "45 min", "0 h" */
export function formatWorkDuration(minutes: number): string {
  if (minutes <= 0) return '0 h'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const totalHours = Math.round(minutes / 60)
  const days = Math.floor(totalHours / WORKDAY_HOURS)
  const hours = totalHours % WORKDAY_HOURS
  if (days === 0) return `${hours} h`
  return hours === 0 ? `${days} g` : `${days} g ${hours} h`
}

/** Minuti -> "6 h", "1 h 30", "45 min" (per ritardi e straordinari) */
export function formatHours(minutes: number): string {
  if (minutes <= 0) return '0 h'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

/** Data ISO -> "oggi, 9:15", "ieri, 17:40", "10 nov, 8:30" */
export function formatDateTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  const day =
    diffDays === 0
      ? 'oggi'
      : diffDays === 1
        ? 'ieri'
        : diffDays === -1
          ? 'domani'
          : dayMonth.format(date)
  return `${day}, ${time.format(date)}`
}

/** Variazione in punti percentuali: 0.03 -> "+3 punti", -0.02 -> "−2 punti" */
export function formatPointsDelta(delta: number): string {
  const points = Math.round(delta * 100)
  if (points === 0) return 'invariata'
  return `${points > 0 ? '+' : '−'}${Math.abs(points)} ${Math.abs(points) === 1 ? 'punto' : 'punti'}`
}

const weekdayDay = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** Intervallo -> "gio 19 nov, 8:00 – 17:00" (stesso giorno) o "gio 19 nov, 10:42 – ven 20 nov, 17:00" */
export function formatRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  const sameDay = from.toDateString() === to.toDateString()
  const start = `${weekdayDay.format(from)}, ${time.format(from)}`
  return sameDay
    ? `${start} – ${time.format(to)}`
    : `${start} – ${weekdayDay.format(to)}, ${time.format(to)}`
}

const shortDate = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** Data ISO -> "ven 20 nov" */
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso))
