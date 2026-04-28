import { defineConfig } from 'vitest/config'

// Node-mode tests for api/ — pure-JS code that runs in Cloudflare Workers
// and doesn't need a DOM. The browser-mode config (vitest.config.ts) is
// for component tests; running parser tests in browser mode works but
// adds 30+ seconds of Playwright startup per run.
export default defineConfig({
  test: {
    include: ['api/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
})
