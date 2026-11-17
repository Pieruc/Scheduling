import { delay, HttpResponse } from 'msw'
import type { ProblemDetails } from '@/api/types/common'

/** Percorso completo di un endpoint, es. api('/kpis') -> '/api/v1/kpis' */
export const api = (path: string) => import.meta.env.VITE_API_URL + path

/** Ritardo realistico, per vedere gli stati di caricamento in sviluppo. */
export const latency = () => delay(400)

/** Risposta di errore nel formato RFC 7807, come il backend vero. */
export function problem(status: number, title: string, detail?: string) {
  const body: ProblemDetails = { type: 'https://p06.local/errors', status, title, detail }
  return HttpResponse.json(body, {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

/**
 * Per provare gli stati di errore: nella console del browser
 *   sessionStorage.setItem('mock:fail', '1')   -> ogni chiamata risponde 503
 *   sessionStorage.removeItem('mock:fail')     -> torna normale
 */
export function simulatedFailure() {
  if (sessionStorage.getItem('mock:fail') === '1') {
    return problem(503, 'Service Unavailable', 'Servizio non disponibile (errore simulato).')
  }
}
