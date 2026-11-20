import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { ReactNode } from 'react'
import { PrimeReactProvider } from 'primereact/api'
import { ConfirmDialog } from 'primereact/confirmdialog'
import { ApiError } from '@/api/errors'
import { setupItalianLocale } from '@/app/locale'
import { ToastProvider } from '@/app/toast/ToastProvider'
import { AuthProvider } from '@/features/auth/AuthProvider'

setupItalianLocale()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // I dati restano "freschi" 30 s: cambiando pagina non si ricaricano subito.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Gli errori 4xx (dati sbagliati, non trovato, permessi) non si risolvono riprovando.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 1,
    },
  },
})

/** Provider globali dell'app: componenti, dati, sessione e notifiche. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrimeReactProvider value={{ ripple: true, locale: 'it' }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        {/* Finestra di conferma condivisa: si apre con confirmDialog({...}) */}
        <ConfirmDialog />
        {/* Pannello di debug delle chiamate: c'è solo in sviluppo */}
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      </QueryClientProvider>
    </PrimeReactProvider>
  )
}
