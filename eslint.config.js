import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Gate scope = product surface (src/ + api/), enforced as an ALLOWLIST via
  // `files` below rather than a blocklist of everything else. Test
  // scaffolding, the separate hub-realtime worker package, one-off audit/
  // seed/preflight tooling under scripts/, and ad-hoc scratch dirs
  // (.audit-scratch/, .stitch/, review/) all carry their own legitimate
  // `any`, empty catches, and intentionally-unused fixture vars; linting
  // them here only adds noise that masks real product-surface regressions.
  // An allowlist means a newly-added scratch/tooling dir is never
  // accidentally swept in (backlog #753, 2026-07-18: `eslint .` had drifted
  // to 217 problems, 204 of them outside src/+api/, because globalIgnores
  // was a blocklist that named `tests/**`/`workers/**` but not the four
  // non-product dirs that had since sprung up: scripts/, .audit-scratch/,
  // .stitch/, review/). `**/*.test.ts` stays ignored within the allowlist
  // too (unit-test fixtures carry legitimate `any`/unused vars per the
  // original c8f18c55 scoping decision) -- without it, switching to an
  // allowlist would newly lint every co-located `src/**/*.test.ts` /
  // `api/**/*.test.ts` file and regrow errors the ratchet never covered.
  // `.wrangler/` is wrangler's gitignored local-dev cache (`.gitignore:25`) --
  // ESLint still walks its generated `.js` bundles regardless of the `files`
  // allowlist above (a base linterOption, not a rule, fires on them) and
  // flags `Unused eslint-disable directive` inside the build output.
  globalIgnores(['dist', '**/*.test.ts', '.wrangler/**']),
  {
    files: ['src/**/*.{ts,tsx}', 'api/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Honor the _-prefix intentional-unused convention the code already
      // follows (handler signature args like _ctx/_env, destructure-omit like
      // _drop/_key). Without this the convention was unenforced and those vars
      // still flagged. Genuinely-dead (non-_) code stays an error.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  // Route/component code-splitting must go through lazyRoute(), which reloads
  // once when a chunk 404s because a deploy replaced this tab's build. Bare
  // React.lazy() dead-ends: it caches the rejected import, so the error
  // boundary's retry replays the same failure forever (2026-08-03 —
  // "Failed to fetch dynamically imported module: .../ProjectDetail-*.js").
  // Making this a lint error is what keeps lazyRoute a real single chokepoint
  // rather than a convention the 50th call site forgets.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/lazyRoute.tsx'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.name='lazy']",
        message: 'Use lazyRoute() from src/lib/lazyRoute instead of React.lazy() so a stale chunk after a deploy self-heals.',
      }],
    },
  },
])
