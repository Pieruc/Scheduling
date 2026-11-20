import type { AuditRecord } from '@/api/types/audit'
import { daysAgo } from './time'

const H = {
  req12: 'sha256:9f2c4b7a1d0e83c5f6a29b1e7d40c8a35e62f19b0d7c4a8e3f5b61d2a9c07e1',
  req11: 'sha256:77ab02e9c4f15d3a8b60e7c29f41d5a3b8e06c7f2d19a4e5b3c80f6d1a2e7b02',
  req10: 'sha256:c41d6e2b9a07f3c58d1e4a6b2f90c7d3e5a81b4f6c2d09e7a3b5f8c1d4e6a29a',
  req09: 'sha256:a0e95b1c7d3f26e48a0c9b5d2f71e3a6c8b40d9e1f5a7c3b2e6d08f4a1c9e53c',
  req08: 'sha256:5b17e3a9c2d06f48b1e5a7c3d90f2b6e4a81c5d7f3b0e9a2c6d14f8b7e3a2d4',
}
const out = (seed: string) => `sha256:${seed.repeat(8).slice(0, 64)}`

/** Record di audit, dal più recente (mockup v2, schermata 10). Le nuove decisioni si aggiungono in cima. */
export const auditRecords: AuditRecord[] = [
  {
    id: 'AUD-0912',
    timestamp: daysAgo(0, 9, 15),
    planId: 'PLAN-0041',
    user: 'gneri',
    action: 'PLAN_GENERATED',
    modelVersion: 'm2-policy-1.3.0',
    solver: 'POLICY',
    inputHash: H.req12,
    outputHash: out('41ab7f'),
    details: { planIds: ['PLAN-0041', 'PLAN-0042', 'PLAN-0043'] },
  },
  {
    id: 'AUD-0911',
    timestamp: daysAgo(1, 17, 41),
    planId: 'PLAN-0040',
    user: 'system',
    action: 'FALLBACK_USED',
    modelVersion: null,
    solver: null,
    inputHash: H.req11,
    outputHash: null,
    details: { trigger: 'Servizio AI non disponibile: nuovo tentativo in corso' },
  },
  {
    id: 'AUD-0905',
    timestamp: daysAgo(7, 8, 42),
    planId: 'PLAN-0037',
    user: 'gneri',
    action: 'DECISION',
    modelVersion: 'm2-policy-1.2.0',
    solver: 'POLICY',
    inputHash: H.req10,
    outputHash: out('c0d9e2'),
    details: { decision: 'APPROVE' },
  },
  {
    id: 'AUD-0904',
    timestamp: daysAgo(7, 8, 30),
    planId: 'PLAN-0037',
    user: 'gneri',
    action: 'PLAN_GENERATED',
    modelVersion: 'm2-policy-1.2.0',
    solver: 'POLICY',
    inputHash: H.req10,
    outputHash: out('c0d9e2'),
    details: { planIds: ['PLAN-0037'] },
  },
  {
    id: 'AUD-0899',
    timestamp: daysAgo(11, 14, 2),
    planId: 'PLAN-0033',
    user: 'system',
    action: 'FALLBACK_USED',
    modelVersion: 'm2-policy-1.2.0',
    solver: 'ATC',
    inputHash: H.req09,
    outputHash: out('33ef10'),
    details: { confidence: 0.48, trigger: 'Confidenza dell’AI sotto la soglia del 60%' },
  },
  {
    id: 'AUD-0898',
    timestamp: daysAgo(11, 13, 55),
    planId: 'PLAN-0033',
    user: 'gneri',
    action: 'RESCHEDULE',
    modelVersion: null,
    solver: null,
    inputHash: H.req09,
    outputHash: null,
    details: { trigger: 'Guasto Saldatrice S2' },
  },
  {
    id: 'AUD-0894',
    timestamp: daysAgo(14, 9, 20),
    planId: 'PLAN-0032',
    user: 'gneri',
    action: 'DECISION',
    modelVersion: 'm2-policy-1.2.0',
    solver: 'POLICY',
    inputHash: H.req08,
    outputHash: out('5d42aa'),
    details: {
      decision: 'REJECT',
      reason: 'Troppo straordinario il sabato, il reparto non è coperto.',
    },
  },
  {
    id: 'AUD-0893',
    timestamp: daysAgo(14, 9, 0),
    planId: 'PLAN-0030',
    user: 'gneri',
    action: 'PLAN_GENERATED',
    modelVersion: 'm2-policy-1.2.0',
    solver: 'POLICY',
    inputHash: H.req08,
    outputHash: out('30b1c7'),
    details: { planIds: ['PLAN-0030', 'PLAN-0031', 'PLAN-0032'] },
  },
  {
    id: 'AUD-0870',
    timestamp: daysAgo(42, 8, 52),
    planId: 'PLAN-0024',
    user: 'lbianchi',
    action: 'DECISION',
    modelVersion: 'm2-policy-1.1.0',
    solver: 'POLICY',
    inputHash: 'sha256:2e81d4c7a9b05f3e6d1c8a4b7f02e9d3c5a61b8f4e7d0c2a9b3f6e1d5c8a4b70',
    outputHash: out('24aa91'),
    details: { decision: 'APPROVE' },
  },
]

let next = 913

/** Aggiunge in cima un record creato dal backend finto (decisioni prese nel Gantt) */
export function addAudit(record: Omit<AuditRecord, 'id'>) {
  auditRecords.unshift({ id: `AUD-${String(next++).padStart(4, '0')}`, ...record })
}

/** Hash SHA-256 finto ma stabile, ricavato da un testo */
function fakeHash(seed: string) {
  let h = 2166136261
  let hex = ''
  while (hex.length < 64) {
    for (const c of seed + hex.length) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
    hex += h.toString(16).padStart(8, '0')
  }
  return `sha256:${hex.slice(0, 64)}`
}

const BY_REQUEST: Record<string, string> = {
  'REQ-0012': H.req12,
  'REQ-0011': H.req11,
  'REQ-0010': H.req10,
  'REQ-0009': H.req09,
  'REQ-0008': H.req08,
}

/** Stesso input = stesso hash: tutti i piani di una richiesta condividono l'hash della ProblemSpec */
export const inputHashOf = (requestId: string) => BY_REQUEST[requestId] ?? fakeHash(requestId)
export const outputHashOf = (planId: string) => fakeHash(`out-${planId}`)
