/**
 * Parse Peripheral-Brain/scripts/scheduled/secrets.ps1 and export its
 * `$env:KEY = "VALUE"` lines into process.env for any vars not already set.
 *
 * Why: scheduled PowerShell scripts source secrets.ps1 directly. Node/tsx
 * processes (audit scripts, seed scripts, e2e-validate) do not, so
 * PB_API_KEY is missing → Hub returns 401. This gives any TS entry point
 * a single call (`loadSecrets()`) that makes Node behave like scheduled PS.
 *
 * secrets.ps1 stays the only source of truth for rotation. NEVER hardcode
 * a token literal as a fallback — that's the pattern that bit us on
 * 2026-04-22 (Bsn6ra_... copied into 3 audit scripts, went stale, caused
 * silent 401s).
 *
 * Path resolution: secrets.ps1 lives in the sibling Peripheral-Brain repo.
 * Default path is computed relative to this file so it works on any
 * machine that has the repos side-by-side (home + work both do).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// mn-ccore-lab/scripts/_lib → ../../../Peripheral-Brain/scripts/scheduled/secrets.ps1
const DEFAULT_SECRETS_PATH = resolve(
  __dirname,
  '..', '..', '..',
  'Peripheral-Brain', 'scripts', 'scheduled', 'secrets.ps1',
)

const PS_ENV_RE = /^\s*\$env:([A-Z_][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*$/

let loaded = false

/**
 * Export every uncommented `$env:KEY = "VALUE"` in secrets.ps1 to process.env.
 * Existing env vars take precedence unless force=true. Returns count of vars
 * populated. Throws if secrets.ps1 is missing AND require=true.
 */
export function loadSecrets(opts: {
  force?: boolean
  require?: boolean
  path?: string
} = {}): number {
  const { force = false, require: requireFile = false, path = DEFAULT_SECRETS_PATH } = opts

  if (loaded && !force) return 0

  if (!existsSync(path)) {
    if (requireFile) {
      throw new Error(
        `secrets.ps1 not found at ${path}. ` +
        `Expected Peripheral-Brain repo sibling to mn-ccore-lab. ` +
        `If your layout differs, pass loadSecrets({ path: '/custom/path' }).`,
      )
    }
    loaded = true
    return 0
  }

  let count = 0
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const m = PS_ENV_RE.exec(line)
    if (!m) continue
    const [, key, value] = m
    if (!force && process.env[key]) continue
    process.env[key] = value
    count++
  }

  loaded = true
  return count
}

/**
 * Convenience: load secrets and return PB_API_KEY, failing loud if still missing.
 * Use this at the top of any script that talks to the Hub.
 */
export function requirePbApiKey(): string {
  loadSecrets()
  const key = process.env.PB_API_KEY
  if (!key) {
    throw new Error(
      'PB_API_KEY not set and not found in secrets.ps1. ' +
      'Set it in ../Peripheral-Brain/scripts/scheduled/secrets.ps1 or export PB_API_KEY in your shell.',
    )
  }
  return key
}
