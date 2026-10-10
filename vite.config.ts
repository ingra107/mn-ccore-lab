import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    modulePreload: false,
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      '/api': {
        // HUB_API_PORT: set by scripts/run-journey-spec.mjs --gate, which runs
        // its own wrangler on a free port so it never tests someone else's API.
        target: `http://localhost:${process.env.HUB_API_PORT ?? 8787}`,
        changeOrigin: true,
      },
    },
  },
})
