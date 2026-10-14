import { defineConfig } from 'vitest/config'

// Node-mode tests for src/lib/ pure-TS utilities that don't need a DOM or
// browser environment (and benefit from node:crypto / node:fs access).
// The browser-mode config (vitest.config.ts) covers component/DOM tests.
// Run: npx vitest run --config vitest.config.lib.ts
export default defineConfig({
  test: {
    include: ['src/lib/__tests__/**/*.test.ts'],
    globals: true,
    environment: 'node',
    // Several tests here walk all of src/ (contract scans). Alone they finish in
    // ~1 s; with a second suite running on the laptop they crossed the 5 s
    // default and failed the commit gate (2026-10-14: inverse-surface and
    // publicationsBundle, both green re-run alone). A real hang still fails.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
