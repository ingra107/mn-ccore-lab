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
