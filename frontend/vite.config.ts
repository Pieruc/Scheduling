import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // "@/..." punta a "src/..." (stesso alias di tsconfig.app.json)
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
