// member-launcher.test.mjs -- routing + security test for the Windows member launcher
// (member-launcher/windows/mnccore-launcher.ps1, 2026-10-12).
//
// Run with: node member-launcher/member-launcher.test.mjs   (Windows only; skips elsewhere)
// Gate:     .githooks/pre-commit runs it when anything under member-launcher/windows/
//           or this file is staged.
//
// Every case fires the launcher through the REGISTERED command line, not a dot-source:
// install.ps1 -PrintCommand gives the exact string Windows stores
// ("<powershell.exe>" ... -File "<launcher>" "%1"); %1 is replaced by the URL as text,
// the way the shell does it, and the whole line goes to CreateProcess verbatim. So
// powershell.exe's own argument split, which is what a raw quote in a URL meets, is
// exercised for real.
//
// MNCCORE_LAUNCHER_DRYRUN=1 is set on every run, so nothing opens. LOCALAPPDATA points
// into a temp dir, where the test copies the launcher (install.ps1 is not run, so the
// registry is never touched). Injection payloads only ever try to WRITE a marker file:
// never use a GUI program (calc, notepad) as a probe.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync, readFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WIN = join(HERE, 'windows')
const skip = process.platform !== 'win32' && 'the Windows member launcher runs on Windows only'
const sysRoot = process.env.SystemRoot || 'C:\\Windows'
const POWERSHELL = join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

const MARK = join(tmpdir(), 'mnccore-member-launcher-injection-marker.txt')

let local, work, spaced, stubClaude, registered, exe, tail

// Every run: dry-run, a temp LOCALAPPDATA, and a stub claude OUTSIDE the target
// folders (so the plan is the same on a machine without Claude Code).
// Windows variable names are case-insensitive, and a hook's env (git, bash) can
// carry another casing than ours: set and drop names without regard to case.
function withVars(base, vars) {
  const out = {}
  const drop = new Set(Object.keys(vars).map((k) => k.toLowerCase()))
  for (const [k, v] of Object.entries(base)) if (!drop.has(k.toLowerCase())) out[k] = v
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) out[k] = v
  return out
}

function env(extra = {}) {
  return withVars(process.env, { MNCCORE_LAUNCHER_DRYRUN: '1', LOCALAPPDATA: local, ...extra })
}

// The registered command line with %1 replaced by the URL, run verbatim.
// An `extra` value of undefined removes that variable.
function fire(url, extra = {}) {
  const line = tail.replace('%1', () => url)
  const e = env(extra)
  const r = spawnSync(exe, [line], { windowsVerbatimArguments: true, argv0: `"${exe}"`, encoding: 'utf8', env: e, cwd: work, timeout: 30_000 })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

// workon through test-harness.ps1: the shipped launcher, dot-sourced, with the
// dialog answered (it never appears on this desktop) and a stub for Claude Code.
// Same powershell.exe -File command-line shape as the registration, URL last.
const HARNESS = join(HERE, 'test-harness.ps1')
function fireHarness(url, { answer = 'no', claude = stubClaude, extra = {} } = {}) {
  const launcher = join(local, 'MNCCORE', 'Launcher', 'mnccore-launcher.ps1')
  const line = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${HARNESS}" -Launcher "${launcher}" -Answer ${answer} -Claude "${claude}" "${url}"`
  const r = spawnSync(exe, [line], { windowsVerbatimArguments: true, argv0: `"${exe}"`, encoding: 'utf8', env: env(extra), cwd: work, timeout: 30_000 })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), timedOut: r.error?.code === 'ETIMEDOUT' }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function waitFor(path, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (existsSync(path)) return true
    sleep(200)
  }
  return existsSync(path)
}

function plan(out) {
  const m = out.match(/^DRYRUN (.*)$/m)
  return m ? JSON.parse(m[1]) : null
}

const fwd = (p) => p.replace(/\\/g, '/')

describe('the member launcher through the registered command line (DRYRUN)', { skip }, () => {
  before(() => {
    // Under the user folder (the launcher refuses anything outside it); %TEMP% is.
    work = mkdtempSync(join(tmpdir(), 'mnccore-member-launcher-'))
    assert.ok(work.toLowerCase().startsWith(homedir().toLowerCase() + '\\'), `${work} is not under ${homedir()}`)
    local = join(work, 'LocalAppData')
    mkdirSync(local, { recursive: true })
    spaced = join(work, 'Sepsis Outcomes, 2026 (v2)')
    mkdirSync(spaced)
    writeFileSync(join(work, 'a-file.txt'), 'x')
    mkdirSync(join(work, 'bin'))
    stubClaude = join(work, 'bin', 'claude.cmd')
    writeFileSync(stubClaude, '@exit /b 0\r\n')
    rmSync(MARK, { force: true })

    const r = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(WIN, 'install.ps1'), '-PrintCommand'],
      { encoding: 'utf8', env: env() })
    assert.equal(r.status, 0, r.stderr)
    registered = r.stdout.trim()
    const m = registered.match(/^"([^"]+)" (.*)$/)
    assert.ok(m, registered)
    exe = m[1]
    tail = m[2]
    const target = join(local, 'MNCCORE', 'Launcher', 'mnccore-launcher.ps1')
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(WIN, 'mnccore-launcher.ps1'), target)
  })
  // Every PowerShell here runs with cwd = work (so nothing it writes by a relative
  // path, a payload or PowerShell's own module cache, lands in the repo): the
  // relative-path payload would land in work. Checked before work is removed.
  after(() => {
    const hits = [join(work, 'mnccore-member-pwned.txt'), join(process.cwd(), 'mnccore-member-pwned.txt')].filter((f) => existsSync(f))
    rmSync(work, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    assert.deepEqual(hits, [], 'a URL ran as PowerShell')
  })
  after(() => {
    const hit = existsSync(MARK)
    rmSync(MARK, { force: true })
    assert.equal(hit, false, 'a URL ran as a command')
  })

  describe('the registered command', () => {
    it('is powershell.exe -File <launcher> "%1": HKCU-installable, no cmd.exe, no .bat', () => {
      assert.equal(exe.toLowerCase(), POWERSHELL.toLowerCase())
      assert.equal(tail, `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${join(local, 'MNCCORE', 'Launcher', 'mnccore-launcher.ps1')}" "%1"`)
      assert.ok(!/cmd(\.exe)?\b/i.test(registered), registered)
      assert.ok(!/\.(bat|cmd)\b/i.test(registered), registered)
    })
    it('the shipped launcher reads no test-only switch; DRYRUN must be exactly "1"', () => {
      const src = readFileSync(join(WIN, 'mnccore-launcher.ps1'), 'utf8')
      assert.ok(!/MNCCORE_LAUNCHER_TEST_/.test(src), 'a test-only environment switch is in the shipped launcher')
      assert.ok(src.includes("$LauncherDryRun = ([string]$env:MNCCORE_LAUNCHER_DRYRUN -eq '1')"))
      // Read the flag by dot-sourcing (defines functions, runs nothing): a real run
      // would open a window or a dialog on this desktop.
      const read = (v) => spawnSync(POWERSHELL, ['-NoProfile', '-Command', `. '${join(WIN, 'mnccore-launcher.ps1')}'; [Console]::Out.Write($LauncherDryRun)`],
        { encoding: 'utf8', env: withVars(process.env, { MNCCORE_LAUNCHER_DRYRUN: v, LOCALAPPDATA: local }), cwd: work, timeout: 30_000 }).stdout.trim()
      assert.equal(read('0'), 'False', 'DRYRUN=0 must not be read as dry-run')
      assert.equal(read('true'), 'False')
      assert.equal(read('1'), 'True')
    })
    it('the launcher and installers are ASCII (PowerShell 5.1 reads a BOM-less .ps1 as ANSI)', () => {
      for (const f of ['mnccore-launcher.ps1', 'install.ps1', 'uninstall.ps1']) {
        const bytes = readFileSync(join(WIN, f))
        assert.ok(bytes.every((b) => b < 128), `${f} has a non-ASCII byte`)
      }
    })
  })

  describe('what it opens', () => {
    it('open: Explorer gets the folder as ONE quoted argument (spaces, commas, parentheses)', () => {
      const r = fire(`mnccore://open/${fwd(spaced)}`)
      assert.equal(r.code, 0, r.out)
      assert.deepEqual(plan(r.out), { verb: 'open', file: join(sysRoot, 'explorer.exe'), arguments: `"${spaced}"` })
    })
    it('open: %-encoded spaces and backslash paths decode to the same folder', () => {
      for (const url of [`mnccore://open/${fwd(spaced).replace(/ /g, '%20')}`, `mnccore://open/${spaced}`]) {
        const r = fire(url)
        assert.equal(r.code, 0, `${url}: ${r.out}`)
        assert.equal(plan(r.out).arguments, `"${spaced}"`)
      }
    })
    it('workon: cmd.exe /d /k "<ABSOLUTE claude>", the folder only as the WORKING DIRECTORY', () => {
      const r = fireHarness(`mnccore://workon/${fwd(spaced)}`)
      assert.equal(r.code, 0, r.out)
      const p = plan(r.out)
      assert.equal(p.verb, 'workon')
      assert.equal(p.file.toLowerCase(), join(sysRoot, 'System32', 'cmd.exe').toLowerCase())
      assert.equal(p.arguments, `/d /k ""${stubClaude}""`)
      assert.equal(p.claude, stubClaude)
      assert.equal(p.cwd, spaced)
    })
    it('workon refuses a claude that resolves inside the folder being opened', () => {
      const inside = join(spaced, 'claude.cmd')
      writeFileSync(inside, '@exit /b 0\r\n')
      try {
        const r = fireHarness(`mnccore://workon/${fwd(spaced)}`, { claude: inside })
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('inside the folder being opened'), r.out)
        assert.equal(plan(r.out), null)
      } finally {
        rmSync(inside, { force: true })
      }
    })
    it('a link encoded per segment the way the Hub builds it decodes exactly once', () => {
      const enc = fwd(spaced).split('/').map((x) => (/^[A-Za-z]:$/.test(x) ? x : encodeURIComponent(x))).join('/')
      const r = fire(`mnccore://open/${enc}`)
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out).arguments, `"${spaced}"`)
    })
    it('a trailing slash and a ./.. segment resolve to the folder', () => {
      const r = fire(`mnccore://open/${fwd(spaced)}/../${encodeURIComponent('Sepsis Outcomes, 2026 (v2)')}/`)
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out).arguments, `"${spaced}"`)
    })
    it('the self-test scheme routes the same way (the HKCU install test uses it)', () => {
      const r = fire(`mnccore-selftest://open/${fwd(spaced)}`)
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out).arguments, `"${spaced}"`)
    })
  })

  describe('what it refuses (exit 1, nothing planned)', () => {
    const cases = [
      ['a raw quote splits the link into extra arguments', () => `mnccore://workon/${fwd(work)}"&echo PWNED>${MARK}`, 'expected one mnccore:// link'],
      ['a raw quote in the opaque form', () => `mnccore:x"&echo PWNED>${MARK}`, 'expected one mnccore:// link'],
      ['an encoded quote', () => `mnccore://open/${fwd(work)}%22&echo%20PWNED`, 'double quote'],
      ['an encoded line break', () => `mnccore://open/${fwd(work)}%0Acalc`, 'control character'],
      ['PowerShell subexpression text is just text (never evaluated)', () => `mnccore://open/${fwd(work)}/$(Set-Content ${fwd(MARK)} PWNED)`, 'The link was not opened'],
      ['a relative-path subexpression is just text too', () => `mnccore://open/${fwd(work)}/$(Set-Content mnccore-member-pwned.txt x)`, 'folder not found'],
      ['a UNC share (refused as text, before any network call)', () => 'mnccore://open///attacker.example/share', 'network shares are refused'],
      ['a backslash UNC share', () => 'mnccore://open/\\\\attacker.example\\share', 'network shares are refused'],
      ['a WebDAV share', () => 'mnccore://workon///attacker.example@SSL/DavWWWRoot/x', 'network shares are refused'],
      ['a device path', () => 'mnccore://open///?/C:/Windows', 'network shares are refused'],
      ['a relative path', () => 'mnccore://open/Box/Sepsis', "own drives"],
      ['a folder outside the user folder', () => 'mnccore://open/C:/Windows/System32', 'inside your user folder'],
      ['a .. walk out of the user folder', () => `mnccore://open/${fwd(work)}/../../../../../../Windows`, 'inside your user folder'],
      ['an alternate data stream', () => `mnccore://open/${fwd(work)}/a-file.txt:x`, 'not a plain folder path'],
      ['a file, not a folder', () => `mnccore://open/${fwd(join(work, 'a-file.txt'))}`, 'folder not found'],
      ['a folder that does not exist', () => `mnccore://workon/${fwd(work)}/nope`, 'folder not found'],
      ['a Peripheral Brain verb', () => 'mnccore://process', 'not a folder link'],
      ['a launch token', () => 'mnccore://launch/lnch_abc', "does not handle 'launch'"],
      ['a file verb', () => `mnccore://file/${fwd(join(work, 'a-file.txt'))}`, "does not handle 'file'"],
      ['another scheme', () => `http://open/${fwd(work)}`, 'does not handle http://'],
    ]
    for (const [name, url, why] of cases) {
      it(name, () => {
        const r = fire(url())
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes(why), `wanted "${why}" in: ${r.out}`)
        assert.equal(plan(r.out), null, r.out)
      })
    }
  })

  // B1 (security review 2026-10-12): files planted in a synced project folder
  // must never run. These cases are NOT dry-run: they start a real cmd.exe (a
  // console window flashes) running a stub claude that writes GOOD and exits.
  describe('real workon runs: nothing planted in the folder runs', () => {
    // Not dry-run, and without the NoDefaultCurrentDirectoryInExePath this test
    // process may itself inherit (Claude Code sets it): a browser does not, so
    // the launcher must set it on its own.
    const REAL_RUN = { MNCCORE_LAUNCHER_DRYRUN: undefined, NoDefaultCurrentDirectoryInExePath: undefined }
    let evil, evilMark, good
    before(() => {
      evil = join(work, 'Shared Box Project')
      mkdirSync(evil)
      evilMark = join(work, 'EVIL-ran.txt')
      good = join(work, 'GOOD-ran.txt')
      for (const name of ['claude.cmd', 'claude.bat', 'node.cmd', 'node.bat']) {
        writeFileSync(join(evil, name), `@echo ${name}>> "${evilMark}"\r\n`)
      }
      // The stub stands in for the npm claude.cmd shim: it looks node up by bare name.
      writeFileSync(stubClaude, `@echo ran> "${good}"\r\n@node --version >nul 2>&1\r\n@exit\r\n`)
    })
    // No after() rewriting the stub: the cmd.exe it started can still hold it
    // open (EBUSY under a loaded pre-commit), and nothing runs after this block.

    it('control: a bare `node` run in that folder DOES pick up the planted node.cmd', () => {
      rmSync(evilMark, { force: true })
      const e = withVars(process.env, { NoDefaultCurrentDirectoryInExePath: undefined })
      spawnSync(join(sysRoot, 'System32', 'cmd.exe'), ['/d', '/c', 'node --version'], { cwd: evil, env: e })
      const live = existsSync(evilMark)
      rmSync(evilMark, { force: true })
      assert.equal(live, true, 'the planted file did not run in the control, so the case below proves nothing')
    })

    it('confirmed workon runs the absolute claude; no planted claude/node file runs', () => {
      rmSync(evilMark, { force: true })
      rmSync(good, { force: true })
      const r = fireHarness(`mnccore://workon/${fwd(evil)}`, { answer: 'yes', extra: REAL_RUN })
      assert.equal(r.timedOut, false, 'the launcher hung (a real dialog?)')
      assert.equal(r.code, 0, r.out)
      assert.ok(r.out.includes(`ASKED ${evil} -> yes`), r.out)
      assert.equal(waitFor(good, 15000), true, 'the stub claude never ran')
      sleep(1500)
      assert.equal(existsSync(evilMark), false, existsSync(evilMark) ? readFileSync(evilMark, 'utf8') : '')
    })

    it('declined workon starts nothing (exit 3)', () => {
      rmSync(good, { force: true })
      const r = fireHarness(`mnccore://workon/${fwd(evil)}`, { answer: 'no', extra: REAL_RUN })
      assert.equal(r.timedOut, false, 'the launcher hung (a real dialog?)')
      assert.equal(r.code, 3, r.out)
      assert.ok(r.out.includes(`ASKED ${evil} -> no`), r.out)
      sleep(2000)
      assert.equal(existsSync(good), false)
      assert.equal(existsSync(evilMark), false)
    })
  })
})
