#!/usr/bin/env node
// Runs a single Playwright journey spec against the local wrangler+vite stack.
//
// `npm run test:journeys -- <spec>` mis-routes the extra arg: npm appends it
// to the invoked binary (concurrently), not to the quoted playwright
// sub-command inside it, so the spec path is silently swallowed. This wrapper
// reads argv itself and builds the playwright sub-command explicitly.
//
// Usage: node scripts/run-journey-spec.mjs [--gate] [--dry-run] <spec-path>
//
// Default: wrangler on :8787, vite on :5173, the checkout's own local D1.
//
// --gate (the deploy gate, `npm run test:journeys:sweep:gate`): nothing it
// runs against can belong to anyone else.
//   - Two free ports, picked here, reach vite (HUB_API_PORT, vite.config.ts)
//     and Playwright (HUB_WEB_PORT, playwright.config.journeys.ts). A second
//     stack on 8787/5173 can no longer answer for this one.
//   - Its own local D1 under .wrangler/journey-gate (HUB_LOCAL_D1_PERSIST,
//     read by local-db-bootstrap.ts, local-db-seed.ts and journeys/localD1.ts),
//     rebuilt from HEAD's schema every run, so a fresh worktree works and a
//     stale or busy dev DB cannot pass or block it.
// Both modes pass --strictPort to vite: a busy port fails the run instead of
// vite moving to the next port while wait-on finds a stranger's server.
//
// --dry-run prints the commands and exits 0 without starting anything.
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const gate = args.includes('--gate')
const dryRun = args.includes('--dry-run')
const specArg = args.find((a) => !a.startsWith('--'))
if (!specArg) {
  console.error('Usage: node scripts/run-journey-spec.mjs [--gate] [--dry-run] <spec-path>')
  process.exit(1)
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

const apiPort = gate ? await freePort() : 8787
let webPort = gate ? await freePort() : 5173
while (webPort === apiPort) webPort = await freePort()
const persist = gate ? '.wrangler/journey-gate' : null

const env = { ...process.env, HUB_API_PORT: String(apiPort), HUB_WEB_PORT: String(webPort) }
// Absolute, so bootstrap/seed/localD1 hit the same directory whatever their cwd.
if (persist) env.HUB_LOCAL_D1_PERSIST = resolve(process.cwd(), persist).replace(/\\/g, '/')
else delete env.HUB_LOCAL_D1_PERSIST

const wranglerCmd =
  `wrangler dev api/index.ts --local --config=wrangler.local.toml --port ${apiPort}` +
  (persist ? ` --persist-to=${persist}` : '')
const viteCmd = `vite --port ${webPort} --strictPort`
const playwrightCmd =
  `wait-on http-get://localhost:${apiPort}/api/projects http-get://localhost:${webPort} && ` +
  `npx playwright test ${specArg} --config=playwright.config.journeys.ts`

if (dryRun) {
  console.log(JSON.stringify({ gate, spec: specArg, apiPort, webPort, persist: env.HUB_LOCAL_D1_PERSIST ?? null,
    setup: gate ? 'npm run test:local:setup' : null, wranglerCmd, viteCmd, playwrightCmd }, null, 2))
  process.exit(0)
}

if (gate) {
  // Fresh schema + seed into the gate's own D1 (the bootstrap wipes it first).
  console.log(`[journey gate] building local D1 in ${persist}`)
  const setup = spawnSync('npm', ['run', 'test:local:setup'], { stdio: 'inherit', shell: true, env })
  if (setup.status !== 0) {
    console.error('[journey gate] test:local:setup failed; not running the sweep')
    process.exit(setup.status ?? 1)
  }
  console.log(`[journey gate] api :${apiPort}, web :${webPort}`)
}

// { shell: true } on Windows joins the args array with plain spaces before
// handing it to cmd.exe — it does NOT auto-quote multi-word items the way a
// POSIX shell spawn would. Without explicit quotes here, cmd.exe splits each
// sub-command on its own spaces and concurrently receives "wrangler", "dev",
// "api/index.ts", ... as separate positional args instead of one command.
const child = spawn(
  'npx',
  ['concurrently', '-k', '-s', 'first', `"${wranglerCmd}"`, `"${viteCmd}"`, `"${playwrightCmd}"`],
  { stdio: 'inherit', shell: true, env },
)

child.on('exit', (code) => process.exit(code ?? 1))
