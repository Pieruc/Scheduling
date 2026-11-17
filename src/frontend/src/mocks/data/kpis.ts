import type { KpiSeries } from '@/api/types/kpis'
import { dateDaysAgo } from './time'

/** Sei settimane di KPI; l'ultima è quella in corso (valori del mockup v2, schermata 1). */
export const kpiSeries: KpiSeries = {
  points: [
    { weeksAgo: 5, onTime: 0.86, late: 3, util: 0.71, adherence: 0.84 },
    { weeksAgo: 4, onTime: 0.88, late: 2, util: 0.74, adherence: 0.86 },
    { weeksAgo: 3, onTime: 0.9, late: 2, util: 0.75, adherence: 0.88 },
    { weeksAgo: 2, onTime: 0.89, late: 2, util: 0.77, adherence: 0.87 },
    { weeksAgo: 1, onTime: 0.91, late: 2, util: 0.76, adherence: 0.9 },
    { weeksAgo: 0, onTime: 0.94, late: 1, util: 0.78, adherence: 0.91 },
  ].map((p) => ({
    date: dateDaysAgo(p.weeksAgo * 7),
    makespanMin: 2280,
    lateOrders: p.late,
    avgUtilization: p.util,
    planAdherence: p.adherence,
    onTimeRate: p.onTime,
  })),
  utilizationByResource: [
    { resourceId: 'R-LAS-01', resourceName: 'Taglio laser', utilization: 0.86 },
    { resourceId: 'R-CNC-01', resourceName: 'Fresa CNC 1', utilization: 0.92 },
    { resourceId: 'R-CNC-02', resourceName: 'Fresa CNC 2', utilization: 0.61 },
    { resourceId: 'R-SAL-01', resourceName: 'Saldatura', utilization: 0.88 },
    { resourceId: 'R-VER-01', resourceName: 'Verniciatura', utilization: 0.7 },
    { resourceId: 'R-COL-01', resourceName: 'Collaudo', utilization: 0.69 },
  ],
}
