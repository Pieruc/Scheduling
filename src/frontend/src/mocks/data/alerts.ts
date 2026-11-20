import type { Alert } from '@/api/types/alerts'
import { daysAgo } from './time'

/** Avvisi aperti (mockup v2, schermata 1). */
export const alerts: Alert[] = [
  {
    id: 'AL-31',
    type: 'INCIDENT',
    title: 'Guasto segnalato da M. Rossi',
    detail: 'Saldatrice S2 non si accende',
    createdAt: daysAgo(0, 10, 42),
    link: { label: 'Ripianifica', planId: 'PLAN-0037' },
    event: { type: 'RESOURCE_DOWN', resourceId: 'R-SAL-02', from: daysAgo(0, 10, 42), to: null },
  },
  {
    id: 'AL-30',
    type: 'PLANS_TO_REVIEW',
    title: '3 piani pronti da valutare',
    detail: 'Commesse C-101 – C-104',
    createdAt: daysAgo(0, 9, 15),
    link: { label: 'Confronta i piani', planRequestId: 'REQ-0012' },
  },
  {
    id: 'AL-29',
    type: 'MAINTENANCE',
    title: 'Fresa CNC 2 in manutenzione',
    detail: 'Già inserita come indisponibilità, 8:00–17:00',
    createdAt: daysAgo(-2, 8, 0),
  },
]
