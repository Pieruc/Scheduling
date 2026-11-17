/** Date dei mock calcolate rispetto a oggi, così i dati sembrano sempre attuali. */

/** Data e ora ISO con fuso locale, `days` giorni fa alle hh:mm */
export function daysAgo(days: number, hh = 9, mm = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hh, mm, 0, 0)
  return toIsoWithOffset(d)
}

/** Solo la data (AAAA-MM-GG), `days` giorni fa */
export function dateDaysAgo(days: number): string {
  return daysAgo(days).slice(0, 10)
}

function toIsoWithOffset(d: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  )
}
