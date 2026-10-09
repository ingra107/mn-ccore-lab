// mnccore-handler.test.mjs — routing test for scripts/mnccore-handler.bat (2026-10-09).
//
// Run with: node scripts/mnccore-handler.test.mjs   (Windows only; skips elsewhere)
// Gate:     .githooks/pre-commit runs it when the handler or this file is staged.
//
// The handler's header has promised since Wave 2 that MNCCORE_HANDLER_DRYRUN exists
// "for the routing test", and no such test existed: the security refusals of the
// launch/ verb had never been exercised. This runs the REAL .bat through cmd.exe,
// exactly as the browser does (one quoted %1), with DRYRUN set so nothing launches.
// USERPROFILE points at a temp dir holding a stub resolver, so the existence check
// runs against a known file and the printed command is predictable.
//
// Not testable here, by design: a %NAME% pair in the URL is expanded by cmd.exe
// itself when Windows starts the .bat ("<bat>" "%1" runs under cmd /c), before
// the handler sees it, so mnccore://desk/a/%USERNAME% arrives as a/<your name>.
// That bounds nothing new: the value must still pass the gate, and the resolver
// launches only for a desk file that exists. A %26 has no closing percent, so cmd
// leaves it alone, and the handler's percent doubling keeps CALL from eating it.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HANDLER = join(dirname(fileURLToPath(import.meta.url)), 'mnccore-handler.bat')
const skip = process.platform !== 'win32' && 'mnccore-handler.bat runs only on Windows'

let home
let resolver
// Injection payloads only ever try to WRITE this file. Never use a GUI program
// (calc, notepad) as a probe: the first draft of this test did, the handler's
// :fail echo really ran it, and Calculator windows opened on Nick's screen.
const MARK = join(tmpdir(), 'mnccore-handler-injection-marker.txt')

function fire(url) {
  // cmd /d /s /c ""<bat>" "<url>"" -- the browser's shape: the whole URL is one quoted arg.
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${HANDLER}" "${url}""`], {
    windowsVerbatimArguments: true,
    encoding: 'utf8',
    env: { ...process.env, MNCCORE_HANDLER_DRYRUN: '1', USERPROFILE: home },
  })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

describe('mnccore-handler.bat routing (DRYRUN)', { skip }, () => {
  before(() => {
    home = mkdtempSync(join(tmpdir(), 'mnccore-handler-'))
    const utils = join(home, 'Peripheral-Brain', 'scripts', 'utils')
    mkdirSync(utils, { recursive: true })
    resolver = join(utils, 'resolve_launch.py')
    writeFileSync(resolver, '# stub\n')
    rmSync(MARK, { force: true })
  })
  after(() => rmSync(home, { recursive: true, force: true }))

  // Runs last: no refusal in this file may have executed URL text as a command.
  // Before the 2026-10-09 :fail fix, every refused URL carrying & or | did exactly that.
  after(() => {
    const hit = existsSync(MARK)
    rmSync(MARK, { force: true })
    assert.equal(hit, false, 'a URL ran as a command: the handler parsed URL text')
  })

  // A literal double quote. A URL whose quotes are unbalanced (x"&cmd) is split by
  // the cmd.exe that Windows starts for the .bat BEFORE this file runs: a do-nothing
  // stub .bat measured the same injection (2026-10-09), so no line in the handler can
  // stop it. That case rests on the browser: the URL parser percent-encodes " (and
  // space and >) in a mnccore://host/path URL. The router refuses the quotes that DO
  // reach the handler, so no later "!x!" line ever holds one.
  for (const url of [
    `mnccore://desk/a/x""&echo PWNED>${MARK}`,
    `mnccore://zzz/x""&echo PWNED>${MARK}`,
    `mnccore://launch/lnch_a""&echo PWNED>${MARK}`,
  ]) {
    it(`refuses a literal quote at the router: ${url}`, () => {
      const r = fire(url)
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes('may not contain a double quote'), r.out)
      assert.equal(existsSync(MARK), false, `${url} executed: ${r.out}`)
    })
  }

  // ! and ^: delayed expansion and caret escapes mangle the value, never run it.
  for (const url of [
    `mnccore://desk/a/x!PATH!&echo PWNED>${MARK}`,
    `mnccore://desk/a/x^&echo PWNED>${MARK}`,
    `mnccore://desk/a/x^|echo PWNED>${MARK}`,
    `mnccore://launch/lnch_a!x!^&echo PWNED>${MARK}`,
  ]) {
    it(`refuses and never runs ${url}`, () => {
      const r = fire(url)
      assert.equal(r.code, 1, r.out)
      assert.ok(!r.out.includes('DRYRUN'), r.out)
      assert.equal(existsSync(MARK), false, `${url} executed: ${r.out}`)
    })
  }

  it('a refusal never executes URL text (unknown verb, workon, launch)', () => {
    for (const url of [
      `mnccore://zzz/x&echo PWNED>${MARK}`,
      `mnccore://workon/C:/nope&echo PWNED>${MARK}`,
      `mnccore://launch/x|echo PWNED>${MARK}`,
    ]) {
      const r = fire(url)
      assert.equal(r.code, 1, r.out)
      assert.equal(existsSync(MARK), false, `${url} executed: ${r.out}`)
    }
  })

  describe('desk/<slug>/<desk-name>', () => {
    for (const ref of ['admin-tasks/dom-award-desk', 'r01-x2/R01_Comment-desk', 'a/b']) {
      it(`routes ${ref} to the resolver's desk mode`, () => {
        const r = fire(`mnccore://desk/${ref}`)
        assert.equal(r.code, 0, r.out)
        assert.ok(r.out.includes(`DRYRUN desk: python -X utf8 "${resolver}" desk "${ref}"`), r.out)
      })
    }

    it('strips one trailing slash like every other verb', () => {
      const r = fire('mnccore://desk/admin-tasks/dom-award-desk/')
      assert.equal(r.code, 0, r.out)
      assert.ok(r.out.includes('desk "admin-tasks/dom-award-desk"'), r.out)
    })

    const refused = [
      'mnccore://desk/',
      'mnccore://desk/admin-tasks',
      'mnccore://desk/admin-tasks/',
      'mnccore://desk/admin-tasks/x/y',
      `mnccore://desk/admin-tasks/x&echo PWNED>${MARK}`,
      'mnccore://desk/admin-tasks/x%26echo',
      'mnccore://desk/admin-tasks/x%22%26echo',
      'mnccore://desk/admin-tasks/..',
      'mnccore://desk/../../Windows/x',
      'mnccore://desk/admin-tasks/..%5c..%5cx',
      'mnccore://desk/admin-tasks\\x',
      'mnccore://desk/admin-tasks/x.html',
      'mnccore://desk/admin-tasks/x y',
      `mnccore://desk/admin-tasks/x|echo PWNED>${MARK}`,
      'mnccore://desk/-x/y',
      'mnccore://desk//y',
    ]
    for (const url of refused) {
      it(`refuses ${url}`, () => {
        const r = fire(url)
        assert.equal(r.code, 1, r.out)
        assert.ok(!r.out.includes('DRYRUN'), r.out)
      })
    }
  })

  describe('launch/<lnch_token> (the Wave-2 refusals, untested until now)', () => {
    it('routes an opaque token to the resolver', () => {
      const r = fire('mnccore://launch/lnch_abc123')
      assert.equal(r.code, 0, r.out)
      assert.ok(r.out.includes(`DRYRUN launch-token: python -X utf8 "${resolver}" "lnch_abc123"`), r.out)
    })
    for (const url of [
      'mnccore://launch/lnch_abc%26echo',
      `mnccore://launch/lnch_abc&echo PWNED>${MARK}`,
      'mnccore://launch/../../evil.bat',
      'mnccore://launch/C:%5cWindows%5cx.bat',
      'mnccore://launch/notatoken',
      'mnccore://launch/',
    ]) {
      it(`refuses ${url}`, () => {
        const r = fire(url)
        assert.equal(r.code, 1, r.out)
        assert.ok(!r.out.includes('DRYRUN'), r.out)
      })
    }
  })

  it('an unknown verb exits 1', () => {
    const r = fire('mnccore://nonesuch/x')
    assert.equal(r.code, 1, r.out)
    assert.ok(r.out.includes('Unknown mnccore:// verb'), r.out)
  })
})
