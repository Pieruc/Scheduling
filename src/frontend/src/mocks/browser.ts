import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/**
 * Avvia il backend finto nel browser. Chiamata da main.tsx solo in sviluppo e solo se
 * VITE_USE_MOCKS=true, quindi in produzione questo codice non viene incluso.
 */
export async function startMocks() {
  const worker = setupWorker(...handlers)
  await worker.start({
    // Le richieste non /api (file di Vite, font, ...) passano senza avvisi;
    // una chiamata /api senza handler viene segnalata in console.
    onUnhandledFrame({ frame, defaults }) {
      if (frame.protocol !== 'http') return
      const { request } = frame.data as { request: Request }
      if (new URL(request.url).pathname.startsWith('/api')) defaults.warn()
    },
  })
}
