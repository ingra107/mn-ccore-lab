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
    // On since 2026-10-14. It was turned off on 2026-04-11 (e8846979, "fix cold
    // start"; CHANGELOG: "modulePreload disabled (0 tags, was 226KB)"), in the
    // same commit that deferred the dashboard queries. Preload tags only name
    // the entry's static imports, which the browser must fetch before the
    // entry runs, so dropping them saved no bytes; our reading is that the
    // gain came from the deferred queries. Measured at 2026-10-14 HEAD: the
    // links are exactly the entry's static imports (15 chunks), and the cost
    // is the dep map, +5.6 kB gzip on the entry. Without preload the browser finds a route's chunks one
    // import level at a time: 3 round trips for the entry, then 5 for Today
    // and My Tasks (4 for Project and Lab Overview). With it, each is one
    // parallel batch. No polyfill: a browser without modulepreload (Safari
    // before 17) ignores the hint and loads as it did before.
    // Stale-chunk recovery for the preload path: src/lib/lazyRoute.tsx.
    modulePreload: { polyfill: false },
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
