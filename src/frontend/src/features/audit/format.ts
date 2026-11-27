import type { AuditAction, AuditRecord } from '@/api/types/audit'
import type { Tone } from '@/lib/labels'

const pct = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 })

/** Azione in parole; per le decisioni dice quale */
export function actionInfo(r: AuditRecord): { label: string; tone: Tone } {
  switch (r.action) {
    case 'PLAN_GENERATED':
      return { label: 'Piani generati', tone: 'blue' }
    case 'RESCHEDULE':
      return { label: 'Ripianificazione', tone: 'amber' }
    case 'FALLBACK_USED':
      return r.solver
        ? { label: 'Riserva usata', tone: 'grey' }
        : { label: 'AI non disponibile', tone: 'red' }
    case 'DECISION':
      if (r.details?.decision === 'APPROVE') return { label: 'Approvato', tone: 'green' }
      if (r.details?.decision === 'REJECT') return { label: 'Rifiutato', tone: 'red' }
      return { label: 'Modificato', tone: 'amber' }
  }
}

export const ACTION_OPTIONS: { value: AuditAction | 'all'; label: string }[] = [
  { value: 'all', label: 'Tutte le azioni' },
  { value: 'PLAN_GENERATED', label: 'Piani generati' },
  { value: 'DECISION', label: 'Decisioni' },
  { value: 'RESCHEDULE', label: 'Ripianificazioni' },
  { value: 'FALLBACK_USED', label: 'Riserva usata' },
]

export const userLabel = (user: string) => (user === 'system' ? 'sistema' : user)

/** "m2-policy-1.3.0" -> "m2-1.3.0" */
const shortVersion = (v: string) => v.replace(/-(policy|context)-/, '-')

/** Il backend manda il tipo di evento (RESOURCE_DOWN), il mock una frase già pronta */
const TRIGGER: Record<string, string> = {
  RESOURCE_DOWN: 'macchina ferma',
  URGENT_ORDER: 'commessa urgente',
  DELAY: 'ritardo',
}

/** Chi ha calcolato il piano: "POLICY · m2-1.3.0", "ATC (confidenza 0,48)", "evento: guasto S2" */
export function engineText(r: AuditRecord): string {
  if (r.action === 'RESCHEDULE') {
    const t = r.details?.trigger
    return t ? `evento: ${TRIGGER[t] ?? t}` : '—'
  }
  if (r.action === 'FALLBACK_USED' && r.solver) {
    const c = r.details?.confidence
    return c !== undefined ? `${r.solver} (confidenza ${pct.format(c)})` : r.solver
  }
  if (!r.solver) return '—'
  if (r.solver === 'MANUAL') return 'modifica a mano'
  return r.modelVersion && r.solver === 'POLICY'
    ? `${r.solver} · ${shortVersion(r.modelVersion)}`
    : r.solver
}

/** Piani coinvolti: "PLAN-0041/42/43" se la richiesta ne ha generati tre */
export function plansText(r: AuditRecord): string {
  const ids = r.details?.planIds
  if (!ids || ids.length < 2) return r.planId
  return [ids[0], ...ids.slice(1).map((id) => id.slice(-2))].join('/')
}

/** "sha256:9f2c…c07e1" -> "9f2c…e1" */
export function shortHash(hash: string | null): string {
  if (!hash) return '—'
  const hex = hash.replace(/^sha256:/, '')
  return `${hex.slice(0, 4)}…${hex.slice(-2)}`
}

/** CSV per Excel in italiano: separatore ";" e BOM, così gli accenti si leggono bene */
export function toCsv(records: AuditRecord[]): string {
  const head = [
    'Id',
    'Quando',
    'Azione',
    'Piano',
    'Nuova versione',
    'Utente',
    'Motore',
    'Modello',
    'Hash input',
    'Hash output',
    'Motivo',
    'Modifiche',
  ]
  const cell = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const rows = records.map((r) =>
    [
      r.id,
      r.timestamp,
      actionInfo(r).label,
      plansText(r),
      r.details?.newPlanId,
      userLabel(r.user),
      engineText(r),
      r.modelVersion,
      r.inputHash,
      r.outputHash,
      r.details?.reason,
      r.details?.changes?.join(' | '),
    ]
      .map(cell)
      .join(';'),
  )
  return '﻿' + [head.map(cell).join(';'), ...rows].join('\r\n')
}
