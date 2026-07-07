import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

// #513: `src/**/*.test.{ts,tsx}` also sweeps up src/lib/__tests__/** --
// node-mode tests (node:fs / node:crypto / global.fetch mocking) exclusively
// owned by vitest.config.lib.ts. Running them here too was pure redundant CI
// time even on the ones that happened to pass; the ones that use node
// built-ins failed outright ("node:fs externalized for browser").
// (useMeetingNotesSeen.logic.test.ts's own exclude entry retired with the
// hook it tested — T12, 2026-07-07 — server-backed seen tracking replaced it.)
export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },
      ],
      headless: true,
    },
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      'src/lib/__tests__/**',
    ],
    globals: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
