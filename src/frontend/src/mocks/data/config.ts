import type { Calendar, Resource, Skill } from '@/api/types/config'
import { daysAgo } from './time'

/** Competenze (mockup v2, schermata 8) */
export const skills: Skill[] = [
  { code: 'TAGLIO', name: 'Taglio' },
  { code: 'FRESATURA', name: 'Fresatura' },
  { code: 'PIEGATURA', name: 'Piegatura' },
  { code: 'SALDATURA', name: 'Saldatura' },
  { code: 'PEZZI_GRANDI', name: 'Pezzi grandi' },
  { code: 'VERNICIATURA', name: 'Verniciatura' },
  { code: 'COLLAUDO', name: 'Collaudo' },
]

export const calendars: Calendar[] = [
  { id: 'CAL-2TURNI', name: '2 turni', shiftsSummary: 'Lun–Ven 8–12 / 13–17' },
  { id: 'CAL-1TURNO', name: '1 turno', shiftsSummary: 'Lun–Ven 8–12' },
  { id: 'CAL-CONTINUO', name: 'Ciclo continuo', shiftsSummary: 'Lun–Sab 6–22' },
]

const resource = (r: Partial<Resource> & Pick<Resource, 'id' | 'name'>): Resource => ({
  type: 'MACHINE',
  capacity: 1,
  skills: [],
  calendarId: 'CAL-2TURNI',
  active: true,
  costPerHour: 50,
  unavailability: [],
  ...r,
})

/** Risorse (mockup v2, schermata 8). Gli handler le modificano in memoria. */
export const resources: Resource[] = [
  resource({ id: 'R-LAS-01', name: 'Taglio laser', skills: ['TAGLIO'], costPerHour: 65 }),
  resource({ id: 'R-CNC-01', name: 'Fresa CNC 1', skills: ['FRESATURA'], costPerHour: 80 }),
  resource({
    id: 'R-CNC-02',
    name: 'Fresa CNC 2',
    skills: ['FRESATURA'],
    costPerHour: 72,
    unavailability: [{ from: daysAgo(-2, 8), to: daysAgo(-2, 17), reason: 'Manutenzione' }],
  }),
  resource({
    id: 'R-SAL-01',
    name: 'Saldatrice S1',
    skills: ['SALDATURA', 'PEZZI_GRANDI'],
    costPerHour: 55,
  }),
  resource({
    id: 'R-SAL-02',
    name: 'Saldatrice S2',
    skills: ['SALDATURA'],
    costPerHour: 55,
    unavailability: [{ from: daysAgo(0, 10, 42), to: daysAgo(-1, 17), reason: 'Guasto' }],
  }),
  resource({
    id: 'R-VER-01',
    name: 'Cabina verniciatura',
    type: 'ROOM',
    skills: ['VERNICIATURA'],
    calendarId: 'CAL-1TURNO',
    costPerHour: 48,
  }),
  resource({ id: 'R-PRE-01', name: 'Pressa piegatrice', skills: ['PIEGATURA'], costPerHour: 58 }),
  resource({
    id: 'R-COL-01',
    name: 'Banco collaudo',
    type: 'ROOM',
    skills: ['COLLAUDO'],
    calendarId: 'CAL-1TURNO',
    costPerHour: 40,
  }),
  resource({
    id: 'P-ROSSI',
    name: 'Marco Rossi',
    type: 'PERSON',
    skills: ['SALDATURA', 'COLLAUDO'],
    costPerHour: 32,
  }),
]
