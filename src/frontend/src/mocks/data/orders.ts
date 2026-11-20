import type { Activity, Order, Precedence, ProcessGraph } from '@/api/types/orders'
import { daysAgo } from './time'

/** Commesse (mockup v2, schermata 2). priority: 1 bassa, 2 media, 3 alta. */
export const orders: Order[] = [
  {
    id: 'C-101',
    customer: 'Rinaldi Carrelli',
    description: 'Telaio carrello',
    domainProfile: 'FACTORY',
    releaseDate: daysAgo(-1, 8),
    dueDate: daysAgo(-3, 18),
    priority: 3,
    weight: 3,
    status: 'OPEN',
    activityCount: 6,
  },
  {
    id: 'C-102',
    customer: 'Edil Marche',
    description: 'Staffe per ponteggio',
    domainProfile: 'FACTORY',
    releaseDate: daysAgo(-1, 8),
    dueDate: daysAgo(-6, 18),
    priority: 2,
    weight: 2,
    status: 'OPEN',
    activityCount: 5,
  },
  {
    id: 'C-103',
    customer: 'Motori Esino',
    description: 'Basamento motore',
    domainProfile: 'FACTORY',
    releaseDate: daysAgo(-1, 8),
    dueDate: daysAgo(-8, 18),
    priority: 2,
    weight: 2,
    status: 'OPEN',
    activityCount: 5,
  },
  {
    id: 'C-104',
    customer: 'Inox Service',
    description: 'Piano di lavoro inox',
    domainProfile: 'FACTORY',
    releaseDate: daysAgo(-1, 8),
    dueDate: null,
    priority: 1,
    weight: 1,
    status: 'OPEN',
    activityCount: 5,
  },
  {
    id: 'C-095',
    customer: 'Rinaldi Carrelli',
    description: 'Telaio carrello (lotto 1)',
    domainProfile: 'FACTORY',
    releaseDate: daysAgo(7, 8),
    dueDate: daysAgo(2, 18),
    priority: 2,
    weight: 2,
    status: 'DONE',
    activityCount: 6,
  },
]

const fs = (from: string, to: string): Precedence => ({
  from,
  to,
  type: 'FS',
  minLagMin: 0,
  maxLagMin: null,
})

const act = (id: string, name: string, skill: string, modes: Activity['modes']): Activity => ({
  id,
  name,
  requiredSkills: [skill],
  modes,
})

const h = (hours: number) => hours * 60

/** Grafo di C-101 come nel mockup; le altre commesse sono catene più semplici. */
export const processGraphs: Record<string, ProcessGraph> = {
  'C-101': {
    activities: [
      act('C101-A1', 'Taglio', 'TAGLIO', [{ resourceIds: ['R-LAS-01'], durationMin: h(2) }]),
      act('C101-A2', 'Fresatura', 'FRESATURA', [
        { resourceIds: ['R-CNC-01'], durationMin: h(3) },
        { resourceIds: ['R-CNC-02'], durationMin: h(3.5) },
      ]),
      act('C101-A3', 'Piegatura', 'PIEGATURA', [{ resourceIds: ['R-PRE-01'], durationMin: h(1) }]),
      act('C101-A4', 'Saldatura', 'SALDATURA', [
        { resourceIds: ['R-SAL-01'], durationMin: h(3) },
        { resourceIds: ['R-SAL-02'], durationMin: h(3) },
      ]),
      act('C101-A5', 'Verniciatura', 'VERNICIATURA', [
        { resourceIds: ['R-VER-01'], durationMin: null },
      ]),
      act('C101-A6', 'Collaudo', 'COLLAUDO', [{ resourceIds: ['R-COL-01'], durationMin: h(1) }]),
    ],
    precedences: [
      fs('C101-A1', 'C101-A2'),
      fs('C101-A1', 'C101-A3'),
      fs('C101-A2', 'C101-A4'),
      fs('C101-A3', 'C101-A4'),
      fs('C101-A4', 'C101-A5'),
      fs('C101-A5', 'C101-A6'),
    ],
  },
}

/** Catena semplice Taglio -> Fresatura -> Saldatura -> Verniciatura -> Collaudo */
function chain(prefix: string, durations: number[]): ProcessGraph {
  const steps: [string, string, string[]][] = [
    ['Taglio', 'TAGLIO', ['R-LAS-01']],
    ['Fresatura', 'FRESATURA', ['R-CNC-01']],
    // Saldatura su S1 oppure S2: due alternative
    ['Saldatura', 'SALDATURA', ['R-SAL-01', 'R-SAL-02']],
    ['Verniciatura', 'VERNICIATURA', ['R-VER-01']],
    ['Collaudo', 'COLLAUDO', ['R-COL-01']],
  ]
  const activities = steps.map(([name, skill, res], i) =>
    act(
      `${prefix}-A${i + 1}`,
      name,
      skill,
      res.map((r) => ({ resourceIds: [r], durationMin: h(durations[i]) })),
    ),
  )
  const precedences = activities.slice(1).map((a, i) => fs(activities[i].id, a.id))
  return { activities, precedences }
}

processGraphs['C-102'] = chain('C102', [2, 3, 3, 2, 1])
processGraphs['C-103'] = chain('C103', [2, 3, 4, 3, 1])
processGraphs['C-104'] = chain('C104', [1.5, 2.5, 2, 2, 1])
processGraphs['C-095'] = chain('C095', [2, 3, 3, 4, 1])
