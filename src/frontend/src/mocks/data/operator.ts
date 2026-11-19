import type { OperatorDay } from '@/api/types/execution'
import { dateDaysAgo, daysAgo, toIsoWithOffset } from './time'

const minutesAgo = (m: number) => toIsoWithOffset(new Date(Date.now() - m * 60_000))

/**
 * Giornata di Marco Rossi, reparto saldatura (mockup v2, schermata 6).
 * La prima attività è in corso da 1 h 52, qualunque sia l'ora in cui si apre l'app.
 */
export const operatorDay: OperatorDay = {
  date: dateDaysAgo(0),
  operatorName: 'Marco Rossi',
  department: 'Reparto saldatura',
  shifts: [
    { start: '08:00', end: '12:00' },
    { start: '13:00', end: '17:00' },
  ],
  resources: [
    { id: 'R-SAL-01', name: 'Saldatrice S1' },
    { id: 'R-SAL-02', name: 'Saldatrice S2' },
  ],
  activities: [
    {
      planId: 'PLAN-0037',
      activityId: 'C-101-A4',
      activityName: 'Saldatura telaio',
      orderId: 'C-101',
      customer: 'Rinaldi Carrelli',
      resourceId: 'R-SAL-01',
      resourceName: 'Saldatrice S1',
      plannedStart: daysAgo(0, 8, 0),
      plannedEnd: daysAgo(0, 11, 40),
      state: 'IN_PROGRESS',
      workedMin: 0,
      runningSince: minutesAgo(112),
      actualStart: minutesAgo(112),
      actualEnd: null,
    },
    {
      planId: 'PLAN-0037',
      activityId: 'C-102-A3',
      activityName: 'Saldatura staffe',
      orderId: 'C-102',
      customer: 'Edil Marche',
      resourceId: 'R-SAL-02',
      resourceName: 'Saldatrice S2',
      plannedStart: daysAgo(0, 13, 30),
      plannedEnd: daysAgo(-1, 10, 0),
      state: 'TODO',
      workedMin: 0,
      runningSince: null,
      actualStart: null,
      actualEnd: null,
      waitingFor: { activityName: 'Fresatura', plannedEnd: daysAgo(0, 13, 0) },
    },
    {
      planId: 'PLAN-0037',
      activityId: 'C-103-A2',
      activityName: 'Saldatura supporti',
      orderId: 'C-103',
      customer: 'Motori Esino',
      resourceId: 'R-SAL-01',
      resourceName: 'Saldatrice S1',
      plannedStart: daysAgo(0, 14, 0),
      plannedEnd: daysAgo(0, 17, 0),
      state: 'TODO',
      workedMin: 0,
      runningSince: null,
      actualStart: null,
      actualEnd: null,
    },
  ],
}
