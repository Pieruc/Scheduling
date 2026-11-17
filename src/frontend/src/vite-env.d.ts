/// <reference types="vite/client" />

/** Variabili d'ambiente lette dall'app (vedi .env.development). */
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_USE_MOCKS: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
