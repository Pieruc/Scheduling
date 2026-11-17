import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { Providers } from '@/app/providers'
import { router } from '@/app/router'

// Ordine degli stili: font, icone, tema PrimeReact, token FlowSync, stili globali.
import '@fontsource-variable/inter'
import 'primeicons/primeicons.css'
import '@/styles/primereact-theme.css'
import '@/styles/tokens.css'
import '@/index.css'

// In sviluppo, con VITE_USE_MOCKS=true, risponde il backend finto (src/mocks).
// L'import dinamico tiene i mock fuori dalla build di produzione.
if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
  const { startMocks } = await import('@/mocks/browser')
  await startMocks()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)
