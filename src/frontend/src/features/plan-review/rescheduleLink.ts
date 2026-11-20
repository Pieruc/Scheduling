import type { RescheduleEvent } from '@/api/types/plans'

/**
 * Indirizzo della pagina Ripianifica, con l'evento già scritto nei parametri:
 * /piani/PLAN-0037/ripianifica?evento=RESOURCE_DOWN&risorsa=R-SAL-02&da=...
 */
export function rescheduleHref(planId: string, event?: RescheduleEvent) {
  const p = new URLSearchParams()
  if (event) {
    p.set('evento', event.type)
    if (event.type === 'RESOURCE_DOWN') {
      p.set('risorsa', event.resourceId)
      p.set('da', event.from)
      if (event.to) p.set('a', event.to)
    } else {
      p.set('commessa', event.orderId)
      if (event.type === 'DELAY') p.set('ritardo', String(event.delayMin))
    }
  }
  const query = p.toString()
  return `/piani/${encodeURIComponent(planId)}/ripianifica${query ? `?${query}` : ''}`
}
