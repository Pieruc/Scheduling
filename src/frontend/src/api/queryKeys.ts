/**
 * Chiavi della cache di TanStack Query, tutte qui.
 * Invalidare una chiave "padre" (es. queryKeys.planRequests.all) ricarica tutte le figlie.
 */
export const queryKeys = {
  kpis: {
    all: ['kpis'] as const,
    range: (from: string, to: string) => ['kpis', { from, to }] as const,
  },
  alerts: {
    all: ['alerts'] as const,
  },
  plans: {
    all: ['plans'] as const,
    gantt: (planId: string) => ['plans', planId, 'gantt'] as const,
  },
  planRequests: {
    all: ['plan-requests'] as const,
    list: (limit?: number) => ['plan-requests', 'list', { limit }] as const,
    detail: (id: string) => ['plan-requests', 'detail', id] as const,
  },
  operator: {
    today: ['operator', 'today'] as const,
  },
  audit: {
    all: ['audit'] as const,
    list: (period: string) => ['audit', { period }] as const,
  },
  users: {
    all: ['users'] as const,
  },
  models: {
    active: ['models', 'active'] as const,
    versions: ['models', 'versions'] as const,
    status: ['models', 'status'] as const,
  },
  resources: {
    all: ['resources'] as const,
  },
  orders: {
    all: ['orders'] as const,
    graph: (orderId: string) => ['orders', orderId, 'process-graph'] as const,
  },
  calendars: {
    all: ['calendars'] as const,
  },
  skills: {
    all: ['skills'] as const,
  },
  profiles: {
    all: ['domain-profiles'] as const,
  },
}
