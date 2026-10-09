import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

// Runs the real hub-realtime worker (wrangler.toml: same entry, same DO
// binding) inside workerd via Miniflare. Run from the repo root:
//   npx vitest run --config workers/hub-realtime/vitest.config.mts
export default defineConfig({
  root: here,
  plugins: [
    cloudflareTest({
      wrangler: { configPath: `${here}wrangler.toml` },
      miniflare: { compatibilityFlags: ['nodejs_compat'] },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
})
