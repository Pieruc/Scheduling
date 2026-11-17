import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { msw } from 'msw/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Serve il service worker di MSW in sviluppo; i mock si avviano in src/mocks/browser.ts
    msw({ mode: 'worker-only' }),
  ],
  resolve: {
    // "@/..." punta a "src/..." (stesso alias di tsconfig.app.json)
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Con VITE_USE_MOCKS=false le chiamate /api vanno al backend Spring
    proxy: { '/api': 'http://localhost:8080' },
  },
})
