import { z } from 'zod'
import type { Resource, ResourceInput } from '@/api/types/config'

/** Regole del form di una risorsa: tutte qui, con i messaggi in italiano. */
export const resourceSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'Inserisci un codice.')
    .regex(/^[A-Z0-9-]+$/, 'Solo lettere maiuscole, numeri e trattini (es. R-CNC-03).'),
  name: z.string().trim().min(1, 'Inserisci un nome.'),
  type: z.enum(['MACHINE', 'PERSON', 'ROOM']),
  capacity: z.number({ error: 'Inserisci la capacità.' }).int().min(1, 'Almeno 1.'),
  // Facoltative, come nel backend: una risorsa senza competenze si usa scegliendola nelle attività
  skills: z.array(z.string()),
  calendarId: z.string().min(1, 'Scegli un calendario.'),
  costPerHour: z.number().min(0, 'Non può essere negativo.').nullable(),
  unavailability: z.array(
    z
      .object({
        from: z.date({ error: 'Scegli l’inizio.' }),
        to: z.date({ error: 'Scegli la fine.' }),
        reason: z.string().trim().min(1, 'Scrivi il motivo.'),
      })
      .refine((u) => u.to > u.from, {
        message: 'La fine deve essere dopo l’inizio.',
        path: ['to'],
      }),
  ),
})

export type ResourceFormValues = z.infer<typeof resourceSchema>

/** Valori iniziali: una risorsa esistente oppure una nuova vuota. */
export function toFormValues(resource?: Resource): ResourceFormValues {
  return {
    id: resource?.id ?? '',
    name: resource?.name ?? '',
    type: resource?.type ?? 'MACHINE',
    capacity: resource?.capacity ?? 1,
    skills: resource?.skills ?? [],
    calendarId: resource?.calendarId ?? 'CAL-2TURNI',
    costPerHour: resource?.costPerHour ?? null,
    unavailability: (resource?.unavailability ?? []).map((u) => ({
      from: new Date(u.from),
      to: new Date(u.to),
      reason: u.reason,
    })),
  }
}

/** Dal form al corpo della richiesta (date in ISO). */
export function toInput(values: ResourceFormValues): ResourceInput {
  return {
    ...values,
    unavailability: values.unavailability.map((u) => ({
      from: u.from.toISOString(),
      to: u.to.toISOString(),
      reason: u.reason,
    })),
  }
}
