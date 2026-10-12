// macos.test.mjs -- what can be checked about the Mac launcher without a Mac
// (2026-10-12; the Mac is where most members run it, and osacompile exists only
// on macOS).
//
// Run with: node member-launcher/macos.test.mjs   (needs bash: macOS, Linux, or Git bash)
// Gate:     .githooks/pre-commit runs it when anything under member-launcher/macos/
//           or this file is staged.
//
//   1. The shell text the applet types into Terminal for workon is EXTRACTED from
//      the AppleScript source (not retyped here) and run under bash with a
//      planted `claude` in the project folder and an empty PATH entry (which
//      means "the current folder"). The planted file must never run; the real
//      claude on PATH must. A control shows the planted file WOULD run under a
//      naive `cd <folder> && claude`.
//   2. The folder is quoted the way AppleScript's `quoted form of` quotes it, and
//      a folder name with a quote, $(...) and backticks stays text.
//   3. install.sh and uninstall.sh: syntax, --dry-run on any OS changes nothing,
//      a real run off a Mac refuses, unknown options refuse.
//   4. Source checks that guard the reviewed security properties stay in place.
//
// NOT covered (needs a Mac): compiling the applet, `on open location`, the
// dialogs, NSWorkspace, Launch Services, Terminal itself.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAC = join(HERE, 'macos')
const APPLESCRIPT = readFileSync(join(MAC, 'MNCCORE Launcher.applescript'), 'utf8')
const BASH = process.platform === 'win32' ? 'bash.exe' : 'bash'
const hasBash = spawnSync(BASH, ['-c', 'exit 0']).status === 0
const skip = !hasBash && 'bash is not available'

// AppleScript `quoted form of`: wrap in single quotes; a ' becomes '\''.
const quotedForm = (s) => `'${s.replace(/'/g, "'\\''")}'`

// The applet's workon command: `set cmd to "<a>" & q & "<b>"`, AppleScript
// string escapes undone.
function workonCommand(q) {
  const m = APPLESCRIPT.match(/^\s*set cmd to "((?:[^"\\]|\\.)*)" & q & "((?:[^"\\]|\\.)*)"\s*$/m)
  assert.ok(m, 'could not find `set cmd to "..." & q & "..."` in the AppleScript')
  const unescape = (s) => s.replace(/\\(.)/g, '$1')
  return unescape(m[1]) + q + unescape(m[2])
}

// Paths as bash sees them (Git bash on Windows wants /c/... forms).
const bashPath = (p) => (process.platform === 'win32' ? p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/') : p)

// PATH is set INSIDE bash: a Windows env block would carry Path and PATH both,
// and Git bash rewrites a Windows-style PATH on the way in.
function sh(script, path) {
  const r = spawnSync(BASH, ['-c', `export PATH=${quotedForm(path)}; ${script}`], { encoding: 'utf8' })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

describe('the Terminal command the Mac applet types for workon', { skip }, () => {
  let work, proj, bin, good, evil, injected
  before(() => {
    work = mkdtempSync(join(tmpdir(), 'mnccore-mac-'))
    // A hostile folder name: a single quote, $(...), backticks, a space.
    proj = join(work, "Shared Box's $(touch INJECTED) `touch INJECTED2` dir")
    mkdirSync(proj)
    bin = join(work, 'bin')
    mkdirSync(bin)
    good = join(work, 'GOOD')
    evil = join(work, 'EVIL')
    injected = [join(work, 'INJECTED'), join(work, 'INJECTED2'), join(proj, 'INJECTED'), join(proj, 'INJECTED2')]
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\necho ran > "${bashPath(good)}"\n`)
    writeFileSync(join(proj, 'claude'), `#!/bin/sh\necho planted > "${bashPath(evil)}"\n`)
    for (const f of [join(bin, 'claude'), join(proj, 'claude')]) chmodSync(f, 0o755)
  })
  after(() => rmSync(work, { recursive: true, force: true }))
  const reset = () => { for (const f of [good, evil, ...injected]) rmSync(f, { force: true }) }
  // An empty PATH entry first: POSIX shells read it as the current folder.
  const pathWithEmpty = () => `:${bashPath(bin)}:/usr/bin:/bin`

  it('control: a naive `cd <folder> && claude` runs the planted file', () => {
    reset()
    sh(`cd ${quotedForm(bashPath(proj))} && claude`, pathWithEmpty())
    assert.equal(existsSync(evil), true, 'the planted claude did not run in the control, so the next case proves nothing')
  })

  it('the applet command runs the PATH claude, never the planted one, and the name stays text', () => {
    reset()
    const r = sh(workonCommand(quotedForm(bashPath(proj))), pathWithEmpty())
    assert.equal(existsSync(good), true, `the real claude did not run: ${r.out}`)
    assert.equal(existsSync(evil), false, 'the planted claude ran')
    for (const f of injected) assert.equal(existsSync(f), false, `the folder name ran as a command: ${f}`)
  })

  it('with no claude on PATH it prints the install hint and runs nothing', () => {
    reset()
    const r = sh(workonCommand(quotedForm(bashPath(proj))), ':/usr/bin:/bin')
    assert.ok(r.out.includes('Claude Code (claude) was not found on your PATH'), r.out)
    assert.equal(existsSync(evil), false, 'the planted claude ran')
  })
})

describe('install.sh / uninstall.sh without a Mac', { skip }, () => {
  // Dry-run lines are shell-quoted (printf %q); undo the escaped spaces for matching.
  const run = (script, args) => {
    const r = spawnSync(BASH, [bashPath(join(MAC, script)), ...args], { encoding: 'utf8', env: { ...process.env, HOME: bashPath(tmpdir()) } })
    return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).replace(/\\ /g, ' ') }
  }
  const onMac = process.platform === 'darwin'

  it('both parse (bash -n)', () => {
    for (const f of ['install.sh', 'uninstall.sh']) {
      const r = spawnSync(BASH, ['-n', bashPath(join(MAC, f))], { encoding: 'utf8' })
      assert.equal(r.status, 0, `${f}: ${r.stderr}`)
    }
  })
  it('install --dry-run lists every step and changes nothing', { skip: onMac && 'would query this Mac' }, () => {
    const r = run('install.sh', ['--dry-run'])
    assert.equal(r.code, 0, r.out)
    for (const step of ['osacompile', 'CFBundleURLSchemes:0 string mnccore', 'codesign --force --deep --sign -', 'lsregister -f', 'Dry run: nothing was changed.']) {
      assert.ok(r.out.includes(step), `missing "${step}" in:\n${r.out}`)
    }
  })
  it('uninstall --dry-run lists every step and changes nothing', { skip: onMac && 'would query this Mac' }, () => {
    const r = run('uninstall.sh', ['--dry-run'])
    assert.equal(r.code, 0, r.out)
    for (const step of ['lsregister -u', 'rm -rf', 'tccutil reset AppleEvents edu.umn.mnccore.launcher', 'mnccore-launcher.log', 'Dry run: nothing was changed.']) {
      assert.ok(r.out.includes(step), `missing "${step}" in:\n${r.out}`)
    }
  })
  it('a real run off a Mac refuses with plain words', { skip: onMac && 'this is a Mac' }, () => {
    for (const f of ['install.sh', 'uninstall.sh']) {
      const r = run(f, [])
      assert.equal(r.code, 1, r.out)
      assert.ok(/is for macOS/.test(r.out), r.out)
    }
  })
  it('an unknown option refuses', () => {
    for (const f of ['install.sh', 'uninstall.sh']) assert.equal(run(f, ['--bogus']).code, 2)
  })
})

describe('the AppleScript keeps the reviewed safety properties (source checks)', () => {
  const src = APPLESCRIPT
  it('decodes once and checks home as text before any shell call', () => {
    assert.equal((src.match(/stringByRemovingPercentEncoding/g) || []).length, 1)
    const textCheck = src.indexOf('if not my isUnder(p, homePath)')
    const firstCd = src.indexOf('do shell script "cd "')
    assert.ok(textCheck > 0 && firstCd > textCheck, 'the home check on the decoded text must come before the first cd')
    assert.ok(src.includes('p contains "/../"') && src.includes('p contains "//"'))
  })
  it('refuses packages and opens with Finder, never plain `open`', () => {
    assert.ok(src.includes('isFilePackageAtPath:realPath'))
    assert.ok(src.includes('"/usr/bin/open -a Finder " & (quoted form of realPath)'))
    assert.ok(!/do shell script "\/usr\/bin\/open " &/.test(src))
  })
  it('workon asks first, defaulting to Cancel', () => {
    const ask = src.indexOf('Start Claude Code in this folder?')
    const terminal = src.indexOf('tell application "Terminal"')
    assert.ok(ask > 0 && terminal > ask)
    assert.ok(src.includes('default button "Cancel" cancel button "Cancel"'))
  })
  it('a refusal shows a fixed message; the reason goes to the log only', () => {
    assert.ok(src.includes('display alert launcherTitle message ("The MN-CCORE Launcher did not open this link.'))
    assert.ok(!/display alert[^\n]*errMsg/.test(src))
  })
  it('the folder only ever reaches a shell through quoted form of', () => {
    for (const line of src.split('\n').filter((l) => /do shell script|do script/.test(l))) {
      assert.ok(!/realPath\b(?! *\))/.test(line.replace(/quoted form of \(?realPath\)?/g, '')) || line.includes('quoted form of'), line)
      assert.ok(!/& p &/.test(line), `raw p in a shell line: ${line}`)
    }
  })
})
