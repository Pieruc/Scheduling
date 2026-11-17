import type { ReactNode } from 'react'
import { PrimeReactProvider } from 'primereact/api'

/** Provider globali dell'app. Qui arriveranno anche TanStack Query e, alla fine, l'autenticazione. */
export function Providers({ children }: { children: ReactNode }) {
  return <PrimeReactProvider value={{ ripple: true }}>{children}</PrimeReactProvider>
}
