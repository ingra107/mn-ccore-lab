import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import { REAL_INPUT_TESTS } from './vitest.realInputTests'

// #513: `src/**/*.test.{ts,tsx}` also sweeps up src/lib/__tests__/** --
// node-mode tests (node:fs / node:crypto / global.fetch mocking) exclusively
// owned by vitest.config.lib.ts. Running them here too was pure redundant CI
// time even on the ones that happened to pass; the ones that use node
// built-ins failed outright ("node:fs externalized for browser").
// (useMeetingNotesSeen.logic.test.ts's own exclude entry retired with the
// hook it tested — T12, 2026-07-07 — server-backed seen tracking replaced it.)
export default defineConfig({
  // Each checkout gets its own cache. Worktrees share node_modules through a
  // junction, and Vite's optimized-deps hash includes the root, so a run started
  // in another checkout deleted the deps this run was serving ("Failed to fetch
  // dynamically imported module"). Reproduced 2026-11-05; pinned by
  // src/lib/__tests__/vitestConfig.test.ts.
  cacheDir: '.vite-cache',
  // Every browser-imported dependency, named. The dep scan fails on one unparsable
  // file (a test being edited when a run starts), Vite then finds these at runtime,
  // re-bundles mid-run and reloads, and the page holds two Reacts: "Cannot read
  // properties of null (reading 'useState')" across many files. Listed, they are
  // bundled once up front whether the scan works or not. The same test pins the list.
  optimizeDeps: {
    include: [
      '@dnd-kit/core', '@dnd-kit/modifiers', '@dnd-kit/sortable', '@dnd-kit/utilities',
      '@formkit/auto-animate/react',
      '@tanstack/react-query', '@tanstack/react-virtual',
      'framer-motion', 'lucide-react', 'partysocket',
      'react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client',
      'react-grid-layout', 'react-router-dom', 'recharts',
    ],
  },
  // tailwindcss(): a browser test that imports src/index.css gets the real
  // layer cascade (button-icon-touch.test.tsx), not a hand-sliced copy of it.
  plugins: [react(), tailwindcss()],
  test: {
    browser: {
      enabled: true,
      // No test reaches the public internet. Some photo URLs point off-site, which
      // refuses this browser within ~40ms, so a test could pass or fail on whether
      // its assertion beat that reply (faces-photo, 2026-11-05).
      provider: playwright({
        launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] },
      }),
      instances: [
        { browser: 'chromium' },
      ],
      headless: true,
    },
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      'src/lib/__tests__/**',
      ...REAL_INPUT_TESTS,
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
