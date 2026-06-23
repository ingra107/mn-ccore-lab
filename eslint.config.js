import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Gate scope = product surface (src/ + api/). Test scaffolding and the
  // separate hub-realtime worker package carry their own legitimate `any`,
  // empty catches, and intentionally-unused fixture vars; linting them here
  // only adds noise that masks real product-surface regressions.
  globalIgnores(['dist', 'tests/**', 'workers/**', '**/*.test.ts']),
  {
    files: ['**/*.{ts,tsx}'],
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
])
