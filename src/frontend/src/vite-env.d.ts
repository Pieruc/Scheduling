/// <reference types="vite/client" />

/** Variabili d'ambiente lette dall'app (vedi .env.development). */
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_USE_MOCKS: 'true' | 'false'
  /** Aree non simulate, es. "auth,config" oppure "all" (vedi mocks/handlers/index.ts) */
  readonly VITE_REAL_AREAS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
