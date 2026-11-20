import type { Calendar, DomainProfile, Resource, Skill } from '@/api/types/config'
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

const WEEKDAYS = [1, 2, 3, 4, 5]

export const calendars: Calendar[] = [
  {
    id: 'CAL-2TURNI',
    name: '2 turni',
    shiftsSummary: '',
    workDays: WEEKDAYS,
    shifts: [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ],
    holidays: [
      { date: '2026-12-08', name: 'Immacolata' },
      { date: '2026-12-25', name: 'Natale' },
      { date: '2026-12-26', name: 'Santo Stefano' },
    ],
  },
  {
    id: 'CAL-1TURNO',
    name: '1 turno',
    shiftsSummary: '',
    workDays: WEEKDAYS,
    shifts: [{ start: '08:00', end: '12:00' }],
    holidays: [{ date: '2026-12-25', name: 'Natale' }],
  },
  {
    id: 'CAL-CONTINUO',
    name: 'Ciclo continuo',
    shiftsSummary: '',
    workDays: [1, 2, 3, 4, 5, 6],
    shifts: [
      { start: '06:00', end: '14:00' },
      { start: '14:00', end: '22:00' },
    ],
    holidays: [],
  },
]

const DAY_SHORT = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const hour = (t: string) => t.replace(/^0/, '').replace(/:00$/, '')

/** "Lun–Ven 8–12 / 13–17": la descrizione breve che calcolerebbe il backend */
export function summarize(c: Pick<Calendar, 'workDays' | 'shifts'>) {
  const d = [...c.workDays].sort((a, b) => a - b)
  const consecutive = d.every((x, i) => i === 0 || x === d[i - 1] + 1)
  const days =
    d.length === 0
      ? 'Nessun giorno'
      : consecutive && d.length > 2
        ? `${DAY_SHORT[d[0]]}–${DAY_SHORT[d[d.length - 1]]}`
        : d.map((x) => DAY_SHORT[x]).join(', ')
  return `${days} ${c.shifts.map((s) => `${hour(s.start)}–${hour(s.end)}`).join(' / ')}`
}
calendars.forEach((c) => (c.shiftsSummary = summarize(c)))

/** Profili di dominio (contratti, A.2) */
export const domainProfiles: DomainProfile[] = [
  {
    code: 'FACTORY',
    name: 'Fabbrica',
    description: 'Job shop flessibile con setup: commesse di produzione su macchine e reparti.',
    defaultObjectiveWeights: { makespan: 0.3, weightedTardiness: 0.5, setup: 0.2 },
    features: ['SEQUENCE_DEPENDENT_SETUP', 'ALTERNATIVE_RESOURCES', 'OVERTIME'],
    inUse: true,
  },
  {
    code: 'PA',
    name: 'Pubblica amministrazione',
    description: 'Pratiche che passano tra uffici con scadenze di legge.',
    defaultObjectiveWeights: { makespan: 0.2, weightedTardiness: 0.8, setup: 0 },
    features: ['HARD_DEADLINES', 'ALTERNATIVE_RESOURCES'],
  },
  {
    code: 'PROJECT',
    name: 'Progetti',
    description: 'Attività di progetto con persone condivise e attese tra le fasi.',
    defaultObjectiveWeights: { makespan: 0.5, weightedTardiness: 0.4, setup: 0.1 },
    features: ['PRECEDENCE_LAGS', 'MULTI_RESOURCE'],
  },
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
