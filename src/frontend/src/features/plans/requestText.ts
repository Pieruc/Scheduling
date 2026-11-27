import type { Resource } from '@/api/types/config'
import type { PlanRequest } from '@/api/types/plans'

/** L'evento di una ripianificazione in parole, con i nomi delle macchine invece dei codici */
export function eventText(request: PlanRequest, resources: Resource[] | undefined): string {
  const e = request.event
  if (!e) return request.label
  if (e.type === 'RESOURCE_DOWN') {
    const name = resources?.find((r) => r.id === e.resourceId)?.name ?? e.resourceId
    return `fermo di ${name}`
  }
  return e.type === 'URGENT_ORDER' ? `${e.orderId} urgente` : `ritardo di ${e.orderId}`
}

/**
 * Il backend spiega il fallimento in una riga, ripetuta per ogni variante
 * ("Nessun piano ammissibile. ECONOMIC: a, b; BALANCED: a, b; ..."): la si divide nei
 * singoli motivi, senza doppioni. I motivi "stimata con un valore di default" sono avvisi,
 * non la causa, e si mostrano a parte.
 */
export function failureReasons(error: string | undefined): { causes: string[]; notes: string[] } {
  if (!error) return { causes: ['Il server non ha indicato il motivo.'], notes: [] }
  const all = error
    .replace(/^Nessun piano ammissibile\.\s*/, '')
    .split(/;\s*/)
    .map((part) => part.replace(/^(ECONOMIC|BALANCED|FAST):\s*/, ''))
    // Un nuovo motivo comincia con un numero o con una parola maiuscola (non con "C-104")
    .flatMap((part) => part.split(/,\s(?=\d+ |[A-ZÀ-Ý][a-zà-ù])/))
    .map((r) => r.trim().replace(/([A-Z][\w-]*)\/([\w-]+)/g, 'attività $2 di $1'))
    .filter(Boolean)
  const unique = [...new Set(all)]
  const isNote = (r: string) => /valore di default/.test(r)
  const causes = unique.filter((r) => !isNote(r))
  return {
    causes: causes.length ? causes : unique,
    notes: causes.length ? unique.filter(isNote) : [],
  }
}

/** Titolo di una richiesta negli elenchi: per le ripianificazioni, con il nome della macchina */
export function requestTitle(request: PlanRequest, resources: Resource[] | undefined): string {
  return request.rescheduleOf && request.event
    ? `Ripianificazione di ${request.rescheduleOf} (${eventText(request, resources)})`
    : request.label
}
