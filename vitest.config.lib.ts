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
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
