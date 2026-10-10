// test-mode.ts -- the one rule for "this request runs on DB_TEST".
//
// A request swaps to the test database only when it asks (X-Test-Mode: true),
// proves the key (X-Test-Mode-Key equals TEST_MODE_KEY), and the binding
// exists. The test-mode middleware in api/index.ts and the error ledger's
// wrapper (api/lib/error-ledger.ts) both read this, so a prod e2e request's
// errors land in DB_TEST's hub_errors and never inflate the prod count.

export function testDbRequested(
  request: Request,
  env: { DB_TEST?: D1Database } & Record<string, unknown>,
): boolean {
  const key = (env as { TEST_MODE_KEY?: string }).TEST_MODE_KEY
  return Boolean(
    request.headers.get('X-Test-Mode') === 'true'
    && env.DB_TEST
    && key
    && request.headers.get('X-Test-Mode-Key') === key,
  )
}
