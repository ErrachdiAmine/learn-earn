import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  build: { outDir: 'dist' },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      // Proxy for live economic calendar feed (avoids CORS)
      '/api/calendar': {
        target: 'https://nfs.faireconomy.media',
        changeOrigin: true,
        rewrite: (path) => '/ff_calendar_thisweek.xml'
      }
    }
  }
})