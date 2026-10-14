import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'

// #513: `src/**/*.test.{ts,tsx}` also sweeps up src/lib/__tests__/** --
// node-mode tests (node:fs / node:crypto / global.fetch mocking) exclusively
// owned by vitest.config.lib.ts. Running them here too was pure redundant CI
// time even on the ones that happened to pass; the ones that use node
// built-ins failed outright ("node:fs externalized for browser").
// (useMeetingNotesSeen.logic.test.ts's own exclude entry retired with the
// hook it tested — T12, 2026-07-07 — server-backed seen tracking replaced it.)
export default defineConfig({
  // tailwindcss(): a browser test that imports src/index.css gets the real
  // layer cascade (button-icon-touch.test.tsx), not a hand-sliced copy of it.
  plugins: [react(), tailwindcss()],
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
    // Browser tests wait on a condition after an interaction
    // (`await expect.poll(...)`, testMount's `waitFor`), never a fixed sleep:
    // a 30ms `tick()` before an assertion lost the race on loaded CI runners
    // (8 red Vitest Gate runs, 2026-10-11/12). Poll often so a passing wait
    // costs little; give a slow runner seconds, not the default 1s.
    expect: { poll: { interval: 10, timeout: 3000 } },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
