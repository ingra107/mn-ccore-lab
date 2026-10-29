// run-journey-spec.test.mjs -- the deploy gate's port, D1 and build plumbing.
//
// Run with: node --test scripts/run-journey-spec.test.mjs
//
// Executes the real script (--dry-run starts nothing) and loads the real
// vite and Playwright configs under the env the gate sets, so a reader that
// stops honouring HUB_API_PORT / HUB_WEB_PORT fails here, not in a deploy.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPEC = 'tests/local/journeys/persona-route-sweep.spec.ts'

function dryRun(...flags) {
  const r = spawnSync(process.execPath, ['scripts/run-journey-spec.mjs', ...flags, '--dry-run', SPEC], {
    cwd: ROOT, encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

function tsxPrint(expr, env) {
  const r = spawnSync('npx', ['tsx', '-e', `"${expr}"`], {
    cwd: ROOT, encoding: 'utf8', shell: true, env: { ...process.env, ...env },
  })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim().split(/\r?\n/).pop()
}

describe('journey-watchdog.mjs', () => {
  const sleeper = 'setTimeout(() => {}, 60000)'
  const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
  const waitFor = async (pred, ms) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200))) if (pred()) return true
    return pred()
  }

  it('kills the target tree once the owner is terminated (the orphaned-stack leak)', async () => {
    const { spawn } = await import('node:child_process')
    const owner = spawn(process.execPath, ['-e', sleeper], { stdio: 'ignore' })
    // A shell with a grandchild, like concurrently's cmd.exe -> wrangler -> workerd.
    const target = spawn(process.execPath, ['-e',
      `const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(sleeper)}],{stdio:'ignore'});` +
      `console.log(c.pid);${sleeper}`], { stdio: ['ignore', 'pipe', 'ignore'] })
    const grandchild = Number(await new Promise((r) => target.stdout.once('data', (d) => r(String(d).trim()))))
    const dog = spawn(process.execPath, ['scripts/journey-watchdog.mjs', String(owner.pid), String(target.pid)],
      { cwd: ROOT, stdio: 'ignore' })
    try {
      await new Promise((r) => setTimeout(r, 1500))
      assert.ok(alive(target.pid) && alive(grandchild), 'the watchdog killed a stack whose owner is alive')
      owner.kill('SIGKILL') // TerminateProcess on Windows: no handler in the owner runs
      assert.ok(await waitFor(() => !alive(target.pid) && !alive(grandchild), 8000), 'stack outlived its owner')
      assert.ok(await waitFor(() => dog.exitCode !== null, 4000), 'watchdog did not exit')
    } finally {
      for (const p of [owner.pid, target.pid, grandchild, dog.pid]) { try { process.kill(p) } catch { /* gone */ } }
    }
  })

  it('exits on its own when the target finishes first (a normal run)', async () => {
    const { spawn } = await import('node:child_process')
    const owner = spawn(process.execPath, ['-e', sleeper], { stdio: 'ignore' })
    const target = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 500)'], { stdio: 'ignore' })
    const dog = spawn(process.execPath, ['scripts/journey-watchdog.mjs', String(owner.pid), String(target.pid)],
      { cwd: ROOT, stdio: 'ignore' })
    try {
      assert.ok(await waitFor(() => dog.exitCode !== null, 5000), 'watchdog outlived a finished target')
      assert.ok(alive(owner.pid), 'watchdog touched the owner')
    } finally {
      for (const p of [owner.pid, dog.pid]) { try { process.kill(p) } catch { /* gone */ } }
    }
  })
})

describe('run-journey-spec.mjs --gate', () => {
  it('runs its own wrangler, vite preview and Playwright on two distinct free ports', () => {
    const p = dryRun('--gate')
    assert.notEqual(p.apiPort, p.webPort)
    assert.match(p.wranglerCmd, new RegExp(`--port ${p.apiPort}( |$)`))
    assert.equal(p.viteCmd, `vite preview --port ${p.webPort} --strictPort`)
    assert.match(p.playwrightCmd, new RegExp(`localhost:${p.apiPort}/api/projects`))
    assert.match(p.playwrightCmd, new RegExp(`localhost:${p.webPort}( |$)`))
    assert.equal(p.setup, 'npm run test:local:setup')
  })

  it('gives every run its own local D1 directory, so a leftover lock cannot block the next run', () => {
    const a = dryRun('--gate')
    const b = dryRun('--gate')
    assert.match(a.persist, /\.wrangler\/journey-gate\/run-\d+$/)
    assert.notEqual(a.persist, b.persist)
    // wrangler gets the repo-relative path; bootstrap/seed/localD1 get the absolute one.
    const rel = a.persist.slice(a.persist.indexOf('.wrangler/'))
    assert.ok(a.wranglerCmd.endsWith(`--persist-to=${rel}`), a.wranglerCmd)
  })

  it('default mode keeps 8787/5173, the dev server and the checkout D1, with --strictPort', () => {
    const p = dryRun()
    assert.equal(p.apiPort, 8787)
    assert.equal(p.webPort, 5173)
    assert.equal(p.persist, null)
    assert.equal(p.viteCmd, 'vite --port 5173 --strictPort')
    assert.ok(!p.wranglerCmd.includes('--persist-to'))
  })
})

describe('run-journey-spec.mjs keeps the stack log of a failed run (#8995)', () => {
  // A stand-in for wrangler+vite+Playwright: prints what the 2026-10-22 run
  // printed, on both streams, and exits with the given code.
  function runWithStack(exitCode) {
    const dir = mkdtempSync(join(tmpdir(), 'journey-stack-'))
    const stack = join(dir, 'stack.mjs')
    writeFileSync(stack,
      "console.log('[0] PUT /api/user-prefs/dashboard.layout.primary 500')\n" +
      "console.error('[0] D1_ERROR: internal error; reference = testref123')\n" +
      `process.exitCode = ${exitCode}\n`)
    try {
      return spawnSync(process.execPath, ['scripts/run-journey-spec.mjs', SPEC], {
        cwd: ROOT, encoding: 'utf8', env: { ...process.env, HUB_JOURNEY_TEST_STACK: stack },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  const keptLog = (stderr) => /log is kept at (\S+\.log)/.exec(stderr)?.[1]

  it('dry-run names the per-run log under .wrangler/journey-gate/logs', () => {
    assert.match(dryRun('--gate').log, /^\.wrangler\/journey-gate\/logs\/run-\d+\.log$/)
  })

  it('a failing run exits non-zero, keeps the log with the wrangler output in it, and names it', () => {
    const r = runWithStack(3)
    assert.equal(r.status, 3, r.stderr)
    assert.match(r.stdout, /dashboard\.layout\.primary 500/) // still reaches the terminal
    const path = keptLog(r.stderr)
    assert.ok(path, `no kept-log line in stderr: ${r.stderr}`)
    try {
      const text = readFileSync(path, 'utf8')
      assert.match(text, /internal error; reference = testref123/)
      assert.match(text, /dashboard\.layout\.primary 500/)
    } finally {
      rmSync(path, { force: true })
    }
  })

  it('--gate refuses HUB_JOURNEY_TEST_STACK: a stand-in can never pass the deploy gate', () => {
    // A stack that would "pass": if the gate ran it, this test sees exit 0.
    const dir = mkdtempSync(join(tmpdir(), 'journey-stack-'))
    const stack = join(dir, 'stack.mjs')
    writeFileSync(stack, 'process.exitCode = 0\n')
    try {
      const r = spawnSync(process.execPath, ['scripts/run-journey-spec.mjs', '--gate', SPEC], {
        cwd: ROOT, encoding: 'utf8', env: { ...process.env, HUB_JOURNEY_TEST_STACK: stack },
      })
      assert.equal(r.status, 2, r.stderr)
      assert.match(r.stderr, /refuses to run a stand-in stack/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a passing run deletes its log and prints no kept-log line', () => {
    const r = runWithStack(0)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(keptLog(r.stderr), undefined)
    const logs = join(ROOT, '.wrangler/journey-gate/logs')
    const mine = existsSync(logs) ? readdirSync(logs).filter((f) => f === `run-${r.pid}.log`) : []
    assert.deepEqual(mine, [])
  })
})

describe('configs honour the gate ports', () => {
  it('vite proxies /api to HUB_API_PORT (dev and preview)', () => {
    const out = tsxPrint(
      "import('./vite.config.ts').then(m => console.log(m.default.server.proxy['/api'].target))",
      { HUB_API_PORT: '61234' },
    )
    assert.equal(out, 'http://localhost:61234')
  })

  it('Playwright drives HUB_WEB_PORT', () => {
    const out = tsxPrint(
      "import('./playwright.config.journeys.ts').then(m => console.log(m.default.use.baseURL))",
      { HUB_WEB_PORT: '61235' },
    )
    assert.equal(out, 'http://localhost:61235')
  })
})
