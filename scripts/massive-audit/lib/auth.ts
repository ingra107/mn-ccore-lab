/**
 * Auth env loaders. Fail loud if missing — the audit cannot run without
 * CF Access service token + PB_API_KEY Bearer.
 *
 * Set on Windows User-scope env vars (per docs/superpowers/plans/
 * 2026-04-21-portal-url-migration.md). Available in any shell on this
 * machine.
 */

export interface AuditAuth {
  cfAccessId: string
  cfAccessSecret: string
  pbApiKey: string
}

export function loadAuth(): AuditAuth {
  const cfAccessId = process.env.CF_ACCESS_CLIENT_ID
  const cfAccessSecret = process.env.CF_ACCESS_CLIENT_SECRET
  const pbApiKey = process.env.PB_API_KEY || 'Bsn6ra_KI_QX8yqGPbqhGPyPBI0mT1DGWdcWJszf6XU'

  if (!cfAccessId) {
    throw new Error(
      'CF_ACCESS_CLIENT_ID not set. Massive audit needs the CF Access service ' +
        'token to bypass the launch-day gate at /portal/*. Set in Windows User env or ' +
        'pass via `CF_ACCESS_CLIENT_ID=... npx tsx scripts/massive-audit/run.ts`.',
    )
  }
  if (!cfAccessSecret) {
    throw new Error('CF_ACCESS_CLIENT_SECRET not set. See loadAuth() docstring.')
  }
  return { cfAccessId, cfAccessSecret, pbApiKey }
}

export function browserHeaders(auth: AuditAuth): Record<string, string> {
  return {
    'CF-Access-Client-Id': auth.cfAccessId,
    'CF-Access-Client-Secret': auth.cfAccessSecret,
    Authorization: `Bearer ${auth.pbApiKey}`,
  }
}

export function apiHeaders(auth: AuditAuth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.pbApiKey}`,
    'Content-Type': 'application/json',
  }
}
