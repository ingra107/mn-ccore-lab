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
//   - Its own local D1 under .wrangler/journey-gate/run-<pid> (HUB_LOCAL_D1_PERSIST,
//     read by local-db-bootstrap.ts, local-db-seed.ts and journeys/localD1.ts),
//     built from HEAD's schema every run, so a fresh worktree works and a
//     stale or busy dev DB cannot pass or block it. One directory per run: a
//     workerd orphaned by an earlier run can still hold its old SQLite lock on
//     Windows, and that lock can no longer block this run. Earlier runs'
//     directories are removed when free; a locked one is left and named.
//   - `vite preview` serves dist/, the exact files `wrangler pages deploy dist`
//     ships, so the sweep certifies the deploy and not the dev bundle. The
//     /api proxy carries over (preview.proxy defaults to server.proxy). No
//     dist/index.html = fail: build first (deploy:pages:gated does).
// Both modes pass --strictPort to vite: a busy port fails the run instead of
// vite moving to the next port while wait-on finds a stranger's server.
//
// Both modes copy everything the stack prints (wrangler and workerd, vite,
// Playwright) into .wrangler/journey-gate/logs/run-<pid>.log as well as the
// terminal. A passing run deletes its log; a failing one keeps it and names it
// in the failure line, so a one-off like the 2026-10-22 miniflare "internal
// error; reference = ..." 500 (#8995) leaves the whole wrangler log behind to
// read instead of a scrolled-away terminal. The newest KEEP_FAILED_LOGS failed
// logs are kept. Deliberately no retry on a 500: a real D1 regression must
// fail the gate.
//
// --dry-run prints the commands and exits 0 without starting anything.
//
// HUB_JOURNEY_TEST_STACK (tests only): a node script run in place of the
// wrangler+vite+Playwright stack, so run-journey-spec.test.mjs can drive the
// real logging and exit path without a server. Refused under --gate: a deploy
// gate that ran a stand-in would pass without sweeping anything.
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const gate = args.includes('--gate')
const dryRun = args.includes('--dry-run')
const specArg = args.find((a) => !a.startsWith('--'))
if (!specArg) {
  console.error('Usage: node scripts/run-journey-spec.mjs [--gate] [--dry-run] <spec-path>')
  process.exit(1)
}
const testStack = process.env.HUB_JOURNEY_TEST_STACK
if (gate && testStack) {
  console.error('[journey gate] HUB_JOURNEY_TEST_STACK is set; the gate refuses to run a stand-in stack in place of the real sweep. Unset it.')
  process.exit(2)
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

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

const apiPort = gate ? await freePort() : 8787
let webPort = gate ? await freePort() : 5173
while (webPort === apiPort) webPort = await freePort()
const GATE_ROOT = '.wrangler/journey-gate'
const LOG_DIR = `${GATE_ROOT}/logs`
const KEEP_FAILED_LOGS = 10
const persist = gate ? `${GATE_ROOT}/run-${process.pid}` : null
const logPath = `${LOG_DIR}/run-${process.pid}.log`

const env = { ...process.env, HUB_API_PORT: String(apiPort), HUB_WEB_PORT: String(webPort) }
// Absolute, so bootstrap/seed/localD1 hit the same directory whatever their cwd.
if (persist) env.HUB_LOCAL_D1_PERSIST = resolve(process.cwd(), persist).replace(/\\/g, '/')
else delete env.HUB_LOCAL_D1_PERSIST

const wranglerCmd =
  `wrangler dev api/index.ts --local --config=wrangler.local.toml --port ${apiPort}` +
  (persist ? ` --persist-to=${persist}` : '')
const viteCmd = `vite${gate ? ' preview' : ''} --port ${webPort} --strictPort`
const playwrightCmd =
  `wait-on http-get://localhost:${apiPort}/api/projects http-get://localhost:${webPort} && ` +
  `npx playwright test ${specArg} --config=playwright.config.journeys.ts`

if (dryRun) {
  console.log(JSON.stringify({ gate, spec: specArg, apiPort, webPort, persist: env.HUB_LOCAL_D1_PERSIST ?? null,
    setup: gate ? 'npm run test:local:setup' : null, wranglerCmd, viteCmd, playwrightCmd, log: logPath }, null, 2))
  process.exit(0)
}

if (gate) {
  if (!existsSync('dist/index.html')) {
    console.error('[journey gate] dist/index.html is missing; run `npm run build` first (the gate sweeps the built site)')
    process.exit(1)
  }
  // Earlier runs' D1 directories: remove the free ones, leave a locked one,
  // never touch one whose run is still alive (a parallel gate in this checkout).
  for (const d of existsSync(GATE_ROOT) ? readdirSync(GATE_ROOT) : []) {
    if (d === 'logs') continue // failed runs' logs, pruned below
    const owner = Number(/^run-(\d+)$/.exec(d)?.[1])
    if (owner && pidAlive(owner)) continue
    try {
      rmSync(join(GATE_ROOT, d), { recursive: true, force: true })
    } catch (e) {
      console.warn(`[journey gate] left ${GATE_ROOT}/${d} (${e.code}); a workerd from an earlier run still holds it`)
    }
  }
  // Fresh schema + seed into this run's own D1.
  console.log(`[journey gate] building local D1 in ${persist}`)
  const setup = spawnSync('npm', ['run', 'test:local:setup'], { stdio: 'inherit', shell: true, env })
  if (setup.status !== 0) {
    console.error('[journey gate] test:local:setup failed; not running the sweep')
    process.exit(setup.status ?? 1)
  }
  console.log(`[journey gate] api :${apiPort}, web :${webPort}`)
}

// This run's log; failed runs' logs past the newest KEEP_FAILED_LOGS go.
mkdirSync(LOG_DIR, { recursive: true })
const failedLogs = readdirSync(LOG_DIR).filter((f) => /^run-\d+\.log$/.test(f))
  .map((f) => ({ f, t: statSync(join(LOG_DIR, f), { throwIfNoEntry: false })?.mtimeMs ?? 0 }))
  .sort((a, b) => b.t - a.t)
for (const { f } of failedLogs.slice(KEEP_FAILED_LOGS)) {
  if (pidAlive(Number(/\d+/.exec(f)[0]))) continue // a parallel run still writing it
  rmSync(join(LOG_DIR, f), { force: true })
}
const log = createWriteStream(logPath)
log.write(`[journey] ${new Date().toISOString()} gate=${gate} spec=${specArg} api :${apiPort} web :${webPort}` +
  ` persist=${persist ?? '(checkout D1)'}\n[journey] ${wranglerCmd}\n`)
// stdout/stderr are piped (not inherited) so they reach both the terminal and
// this run's log; stdin stays inherited, as before.
const childStdio = ['inherit', 'pipe', 'pipe']
const child = testStack
  ? spawn(process.execPath, [testStack], { stdio: childStdio, env })
  // { shell: true } on Windows joins the args array with plain spaces before
  // handing it to cmd.exe — it does NOT auto-quote multi-word items the way a
  // POSIX shell spawn would. Without explicit quotes here, cmd.exe splits each
  // sub-command on its own spaces and concurrently receives "wrangler", "dev",
  // "api/index.ts", ... as separate positional args instead of one command.
  : spawn(
    'npx',
    ['concurrently', '-k', '-s', 'first', `"${wranglerCmd}"`, `"${viteCmd}"`, `"${playwrightCmd}"`],
    { stdio: childStdio, shell: true, env },
  )
child.stdout.on('data', (d) => { process.stdout.write(d); log.write(d) })
child.stderr.on('data', (d) => { process.stderr.write(d); log.write(d) })

// concurrently -k only cleans up when this runner finishes normally. If the
// runner is terminated from outside, Windows leaves the whole stack running
// (the 2026-10-11 :5173/:8787 leak). A detached watchdog kills the stack's tree
// once this process is gone; it exits on its own after a normal finish.
const watchdog = fileURLToPath(new URL('./journey-watchdog.mjs', import.meta.url))
spawn(process.execPath, [watchdog, String(process.pid), String(child.pid)], {
  detached: true, stdio: 'ignore', windowsHide: true,
}).unref()

// 'close', not 'exit': it fires after the piped streams drain, so the log is
// complete when it is kept.
child.on('close', (code) => {
  const status = code ?? 1
  log.end(() => {
    if (status === 0) {
      rmSync(logPath, { force: true })
    } else {
      console.error(`[journey${gate ? ' gate' : ''}] FAILED (exit ${status}); the full wrangler/vite/Playwright log is kept at ${resolve(logPath).replace(/\\/g, '/')}`)
    }
    process.exit(status)
  })
})
