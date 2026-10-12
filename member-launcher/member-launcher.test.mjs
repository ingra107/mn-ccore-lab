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

let local, work, spaced, registered, exe, tail

function env() {
  return { ...process.env, MNCCORE_LAUNCHER_DRYRUN: '1', LOCALAPPDATA: local }
}

// The registered command line with %1 replaced by the URL, run verbatim.
function fire(url) {
  const line = tail.replace('%1', () => url)
  const r = spawnSync(exe, [line], { windowsVerbatimArguments: true, argv0: `"${exe}"`, encoding: 'utf8', env: env() })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
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
  after(() => rmSync(work, { recursive: true, force: true }))
  after(() => {
    const rel = join(process.cwd(), 'mnccore-member-pwned.txt')
    const relHit = existsSync(rel)
    rmSync(rel, { force: true })
    assert.equal(relHit, false, 'a URL ran as PowerShell')
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
    it('workon: cmd.exe /k claude with the folder as the WORKING DIRECTORY, never as command text', () => {
      const r = fire(`mnccore://workon/${fwd(spaced)}`)
      assert.equal(r.code, 0, r.out)
      const p = plan(r.out)
      assert.equal(p.verb, 'workon')
      assert.equal(p.file.toLowerCase(), join(sysRoot, 'System32', 'cmd.exe').toLowerCase())
      assert.equal(p.arguments, '/k claude')
      assert.equal(p.cwd, spaced)
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
})
