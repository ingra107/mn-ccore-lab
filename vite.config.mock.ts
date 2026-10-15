import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5199, proxy: { '/api': { target: 'https://mn-ccore-lab.pages.dev', changeOrigin: true, secure: true } } },
})
