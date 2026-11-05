import { defineConfig } from 'vitest/config'

// Node-mode tests for api/ — pure-JS code that runs in Cloudflare Workers
// and doesn't need a DOM. The browser-mode config (vitest.config.ts) is
// for component tests; running parser tests in browser mode works but
// adds 30+ seconds of Playwright startup per run.
export default defineConfig({
  cacheDir: '.vite-cache', // per checkout: node_modules is a shared junction (see vitest.config.ts)
  test: {
    include: ['api/**/*.test.ts'],
    globals: true,
    environment: 'node',
    globalSetup: ['api/test-support/prod-schema-global-setup.ts'],
  },
})
