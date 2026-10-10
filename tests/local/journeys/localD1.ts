import { execSync } from 'node:child_process'

/**
 * Run one SQL statement against the LOCAL Miniflare D1 the journey stack uses.
 *
 * Journey workers run in parallel and each `wrangler d1 execute` opens the same
 * SQLite file wrangler dev holds, so two of them at once can fail with
 * SQLITE_BUSY ("database is locked"; seen 2026-10-08 with members-only and
 * first-login-netid-not-in-code side by side). Retry with backoff (up to
 * six tries, ~11s), then throw.
 */
export function localD1(sql: string): string {
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_ACCOUNT_ID
  // HUB_LOCAL_D1_PERSIST: the deploy gate's own local D1 (run-journey-spec.mjs --gate).
  const persist = process.env.HUB_LOCAL_D1_PERSIST
  const persistFlag = persist ? ` --persist-to="${persist.replace(/\\/g, '/')}"` : ''
  for (let attempt = 1; ; attempt++) {
    try {
      return execSync(
        `npx wrangler d1 execute mnccore-lab --local --config=wrangler.local.toml --json${persistFlag} --command "${sql}"`, // wrangler-d1-allowed: --local Miniflare, no cloud auth
        { env, stdio: ['ignore', 'pipe', 'pipe'] },
      ).toString()
    } catch (e) {
      // The lock error surfaces in stderr, stdout or the message depending on
      // where workerd reports it, and as a generic exit 1 otherwise; a local
      // test DB has no failure worth not retrying, so retry any, then throw.
      if (attempt >= 6) throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750 * attempt)
    }
  }
}
