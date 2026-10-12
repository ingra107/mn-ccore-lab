import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { buildMemberLauncherZips } from './scripts/member-launcher-zip.ts'

// The member launcher downloads (Settings > Integrations), zipped from
// member-launcher/ on every build and answered by the dev server at the same
// paths. Rebuilt per request in dev, so an edit to a script shows up at once.
function memberLauncherZips(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url))
  return {
    name: 'member-launcher-zips',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const zip = req.url ? buildMemberLauncherZips(root)[req.url.split('?')[0]] : undefined
        if (!zip) return next()
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Length', String(zip.length))
        res.end(Buffer.from(zip))
      })
    },
    generateBundle() {
      for (const [path, zip] of Object.entries(buildMemberLauncherZips(root))) {
        // URL path '/portal/downloads/x.zip' -> dist/portal/downloads/x.zip
        this.emitFile({ type: 'asset', fileName: path.slice(1), source: zip })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), memberLauncherZips()],
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
