import { z } from 'zod'
import type { Calendar, CalendarInput, Shift } from '@/api/types/config'

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Orario non valido.')

export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Regole del form di un calendario, con i messaggi in italiano */
export const calendarSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^CAL-[A-Z0-9-]+$/, 'Usa il formato CAL-NOME, es. CAL-NOTTE.'),
    name: z.string().trim().min(1, 'Inserisci un nome.'),
    workDays: z.array(z.number()).min(1, 'Scegli almeno un giorno lavorativo.'),
    shifts: z.array(z.object({ start: time, end: time })).min(1, 'Aggiungi almeno un turno.'),
    holidays: z.array(
      z.object({
        date: z.string().min(1, 'Scegli la data.'),
        name: z.string().trim().min(1, 'Scrivi il nome della festività.'),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    // Ogni turno finisce dopo l'inizio e non si sovrappone al precedente
    const order = v.shifts
      .map((s, i) => ({ ...s, i }))
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    order.forEach((s, k) => {
      if (toMinutes(s.end) <= toMinutes(s.start)) {
        ctx.addIssue({
          code: 'custom',
          path: ['shifts', s.i, 'end'],
          message: 'La fine deve essere dopo l’inizio.',
        })
      } else if (k > 0 && toMinutes(s.start) < toMinutes(order[k - 1].end)) {
        ctx.addIssue({
          code: 'custom',
          path: ['shifts', s.i, 'start'],
          message: `Si sovrappone al turno ${order[k - 1].start}–${order[k - 1].end}.`,
        })
      }
    })
    const seen = new Set<string>()
    v.holidays.forEach((h, i) => {
      if (h.date && seen.has(h.date)) {
        ctx.addIssue({
          code: 'custom',
          path: ['holidays', i, 'date'],
          message: 'Data già inserita.',
        })
      }
      seen.add(h.date)
    })
  })

export type CalendarFormValues = z.infer<typeof calendarSchema>

/** Ore di lavoro a settimana: durata dei turni × giorni lavorativi */
export function weeklyHours(c: { workDays: number[]; shifts: Shift[] }) {
  const perDay = c.shifts.reduce((sum, s) => {
    const d = toMinutes(s.end) - toMinutes(s.start)
    return d > 0 ? sum + d : sum
  }, 0)
  return (perDay * c.workDays.length) / 60
}

export function toFormValues(c?: Calendar): CalendarFormValues {
  return {
    id: c?.id ?? 'CAL-',
    name: c?.name ?? '',
    workDays: c?.workDays ?? [1, 2, 3, 4, 5],
    shifts: c?.shifts ?? [{ start: '08:00', end: '12:00' }],
    holidays: c?.holidays ?? [],
  }
}

export function toInput(v: CalendarFormValues): CalendarInput {
  return {
    ...v,
    workDays: [...v.workDays].sort((a, b) => a - b),
    shifts: [...v.shifts].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
    holidays: [...v.holidays].sort((a, b) => a.date.localeCompare(b.date)),
  }
}
