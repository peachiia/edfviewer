import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['node_modules', 'dist', '.claude/**'],
  },
  server: {
    host: '0.0.0.0',
    port: 8401,
    allowedHosts: ['edfviewer.peachiia.com'],
  },
})
