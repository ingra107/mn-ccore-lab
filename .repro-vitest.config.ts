// TEMPORARY flake experiment, never committed.
import { mergeConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import base from './vitest.config'
const merged = mergeConfig(base, {
  cacheDir: process.env.REPRO_CACHE,
  ...(process.env.REPRO_ROOT ? { root: process.env.REPRO_ROOT } : {}),
  logLevel: 'info',
})
if (process.env.REPRO_NONET) merged.test.browser.provider = playwright({ launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] } })
export default merged
