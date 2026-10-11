// auth-mode.ts -- the one place that decides whether /api enforces sign-in.
//
// Fail closed (plan: PB Scratch/plans/2026-10-10-api-worker-reconciled.md,
// piece 1). Until 2026-10-10 every reader tested `REQUIRE_AUTH === '1'`, so a
// runtime that forgot the variable served every route to an anonymous caller
// as a member. That is how the cron Worker's workers.dev URL exposed the Hub on
// 2026-10-08: it ran the same code without the Pages project's REQUIRE_AUTH.
//
// Now a missing variable means "enforce". Only HUB_LOCAL_DEV="1" opens it, and
// only the local configs set that (wrangler.local.toml, the vitest envs that
// test dev behaviour). An explicit REQUIRE_AUTH="1" still wins over the dev
// flag, so a prod environment carrying both stays closed.

export interface AuthModeEnv {
  REQUIRE_AUTH?: string
  HUB_LOCAL_DEV?: string
}

/** True when an anonymous caller must be refused. Every auth decision reads this. */
export function authEnforced(env: AuthModeEnv | null | undefined): boolean {
  if (env?.REQUIRE_AUTH === '1') return true
  return env?.HUB_LOCAL_DEV !== '1'
}
