import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

// #513: `src/**/*.test.{ts,tsx}` also swept up two classes of test that
// don't belong in a browser (Playwright chromium) environment:
//   1. src/lib/__tests__/** -- node-mode tests (node:fs / node:crypto /
//      global.fetch mocking) exclusively owned by vitest.config.lib.ts.
//      Running them here too was pure redundant CI time even on the ones
//      that happened to pass; the ones that use node built-ins failed
//      outright ("node:fs externalized for browser").
//   2. useMeetingNotesSeen.logic.test.ts -- not a vitest test at all (no
//      describe/it, imports node:assert/strict) -- a manual `npx tsx`
//      script per its own header comment. Excluded from BOTH vitest
//      configs; its lack of an automated gate is tracked separately
//      (PB improvement-backlog #505), not something this exclude changes.
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
      'src/hooks/__tests__/useMeetingNotesSeen.logic.test.ts',
    ],
    globals: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
