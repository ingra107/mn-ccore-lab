// mnccore_handler.test.mjs — routing + security test for scripts/mnccore_handler.py (2026-10-09).
//
// Run with: node scripts/mnccore_handler.test.mjs   (Windows only; skips elsewhere)
// Gate:     .githooks/pre-commit runs it when the handler, the registration script or
//           this file is staged.
//
// Every case fires the handler through the REGISTERED command line, not a module
// import: register_mnccore_protocol.py --print-command gives the exact string Windows
// stores ("<pythonw.exe>" -I "<handler.py>" "%1"); %1 is replaced by the URL as text,
// the way the shell does it, and the whole line goes to CreateProcess verbatim. So the
// C runtime's argv split, which is what a raw quote in a URL meets, is exercised for
// real. Most cases swap pythonw.exe for the python.exe beside it to read stdout (same
// C runtime, same split); the pythonw cases check the exit code and the log.
//
// MNCCORE_HANDLER_DRYRUN=1 is set on every handler run, so nothing launches and no
// balloon shows. USERPROFILE, TEMP and LOCALAPPDATA point into a temp dir with stub
// files. Injection payloads only ever try to WRITE a marker file: never use a GUI
// program (calc, notepad) as a probe; an earlier draft of the .bat test did, and
// Calculator windows opened on Nick's screen.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HANDLER = join(HERE, 'mnccore_handler.py')
const REGISTER = join(HERE, 'register_mnccore_protocol.py')
const skip = process.platform !== 'win32' && 'the mnccore:// handler is Windows only'

const MARK = join(tmpdir(), 'mnccore-pyhandler-injection-marker.txt')
const CONTROL_MARK = join(tmpdir(), 'mnccore-pyhandler-control-marker.txt')

let home, resolver, pythonw, pythonExe, tail, registered
const sysRoot = process.env.SystemRoot || 'C:\\Windows'

// The brain.db projects rows workon reads (status, primary_folder).
let PROJECT_ROWS = []
function writeProjects(rows) {
  if (rows !== PROJECT_ROWS && PROJECT_ROWS.length === 0) PROJECT_ROWS = rows
  const db = join(home, 'Peripheral-Brain', 'data', 'brain.db')
  mkdirSync(dirname(db), { recursive: true })
  rmSync(db, { force: true })
  const r = spawnSync(pythonExe, ['-c', [
    'import sqlite3, sys',
    'c = sqlite3.connect(sys.argv[1])',
    'c.execute("CREATE TABLE projects (id TEXT, status TEXT, primary_folder TEXT)")',
    'a = sys.argv[2:]',
    'c.executemany("INSERT INTO projects VALUES (?, ?, ?)", [(str(i), a[2 * i], a[2 * i + 1]) for i in range(len(a) // 2)])',
    'c.commit()',
  ].join('\n'), db, ...rows.flat()], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}

// A real (NOT dry-run) run through the registered command line (python.exe in
// place of pythonw.exe, same C-runtime argv split). workon shows no dialog (Nick,
// 2026-10-12: "No dialog"), so nothing here can sit on the desktop; PATH holds no
// real `claude` (nothing real can start), and a hard timeout fails a hang.
function fireReal(url) {
  const line = tail.replace('%1', () => url)
  const env = { ...handlerEnv() }
  for (const k of Object.keys(env)) {
    if (/^(MNCCORE_HANDLER_DRYRUN|NoDefaultCurrentDirectoryInExePath|path)$/i.test(k)) delete env[k]
  }
  env.Path = `${join(sysRoot, 'System32')};${sysRoot}`
  const r = spawnSync(pythonExe, [line], { windowsVerbatimArguments: true, argv0: `"${pythonExe}"`, encoding: 'utf8', env, cwd: home, timeout: 30_000 })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), timedOut: r.error?.code === 'ETIMEDOUT' }
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function handlerEnv() {
  return {
    ...process.env,
    MNCCORE_HANDLER_DRYRUN: '1',
    USERPROFILE: home,
    TEMP: home,
    TMP: home,
    LOCALAPPDATA: join(home, 'LocalAppData'),
  }
}

// The registered command line with %1 replaced by the URL, run verbatim.
function fire(url, { gui = false } = {}) {
  const exe = gui ? pythonw : pythonExe
  const line = tail.replace('%1', () => url)
  const r = spawnSync(exe, [line], {
    windowsVerbatimArguments: true,
    argv0: `"${exe}"`,
    encoding: 'utf8',
    env: handlerEnv(),
    cwd: home, // anything the handler or its toast writes by a relative path lands in the temp home, never the repo
    timeout: 30_000,
  })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

// The JSON plan a DRYRUN line carries, or null.
function plan(out, label) {
  const m = out.match(new RegExp(`^DRYRUN ${label}: (.*)$`, 'm'))
  return m ? JSON.parse(m[1]) : null
}

function logText() {
  const p = join(home, 'mnccore-handler.log')
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

describe('mnccore_handler.py through the registered command line (DRYRUN)', { skip }, () => {
  before(() => {
    home = mkdtempSync(join(tmpdir(), 'mnccore-pyhandler-'))
    const utils = join(home, 'Peripheral-Brain', 'scripts', 'utils')
    mkdirSync(utils, { recursive: true })
    resolver = join(utils, 'resolve_launch.py')
    writeFileSync(resolver, '# stub\n')
    writeFileSync(join(home, 'Peripheral-Brain', 'Quick_Process.bat'), '@exit /b 0\n')
    writeFileSync(join(home, 'Peripheral-Brain', 'Quick_Chat_seeded.bat'), '@exit /b 0\n')
    mkdirSync(join(home, 'LocalAppData'), { recursive: true })
    rmSync(MARK, { force: true })
    rmSync(CONTROL_MARK, { force: true })

    const r = spawnSync('python', ['-X', 'utf8', REGISTER, '--print-command'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    registered = r.stdout.trim()
    const m = registered.match(/^"([^"]+)" (.*)$/)
    assert.ok(m, registered)
    pythonw = m[1]
    tail = m[2]
    pythonExe = pythonw.replace(/pythonw\.exe$/i, 'python.exe')
  })
  after(() => rmSync(home, { recursive: true, force: true }))

  // Runs last: no case in this file may have executed URL text as a command.
  after(() => {
    const hit = existsSync(MARK)
    rmSync(MARK, { force: true })
    assert.equal(hit, false, 'a URL ran as a command')
  })

  describe('the registered command', () => {
    it('is pythonw.exe -I <handler.py> "%1", with no cmd.exe and no .bat anywhere', () => {
      assert.match(pythonw, /\\pythonw\.exe$/i)
      assert.equal(tail, `-I "${HANDLER}" "%1"`)
      assert.ok(!/cmd(\.exe)?\b/i.test(registered), registered)
      assert.ok(!/\.(bat|cmd)\b/i.test(registered), registered)
      assert.ok(existsSync(pythonw), pythonw)
    })
  })

  describe('raw quotes (the case the .bat could not stop)', () => {
    // Control: prove the payload is live. Under the old registration shape Windows ran
    // `cmd /c "<bat>" "%1"`, and a do-nothing stub .bat is enough for the tail to run.
    it('control: the same payload runs under the old cmd.exe shape', () => {
      const stub = join(home, 'stub-handler.bat')
      writeFileSync(stub, '@exit /b 0\n')
      const url = `mnccore://zzz/x"&echo PWNED>${CONTROL_MARK}`
      spawnSync('cmd.exe', ['/d', '/s', '/c', `""${stub}" "${url}""`], { windowsVerbatimArguments: true })
      const live = existsSync(CONTROL_MARK)
      rmSync(CONTROL_MARK, { force: true })
      assert.equal(live, true, 'the control payload did not fire, so the cases below prove nothing')
    })

    for (const url of [
      `mnccore://zzz/x"&echo PWNED>${MARK}`,
      `mnccore:x"&echo PWNED>${MARK}`,
      `mnccore://desk/a/x"&echo PWNED>${MARK}`,
      `mnccore://launch/lnch_a"&echo PWNED>${MARK}`,
      `mnccore://workon/C:/x"&echo PWNED>${MARK}`,
    ]) {
      it(`an unbalanced quote splits into extra args and is refused: ${url}`, () => {
        const r = fire(url)
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('expected one mnccore:// URL argument'), r.out)
        assert.ok(!r.out.includes('DRYRUN'), r.out)
        assert.equal(existsSync(MARK), false, `${url} executed: ${r.out}`)
      })
    }

    it('an unbalanced quote under the real pythonw.exe is refused and runs nothing', () => {
      const r = fire(`mnccore://zzz/x"&echo PWNED>${MARK}`, { gui: true })
      assert.equal(r.code, 1)
      assert.equal(existsSync(MARK), false)
      assert.ok(logText().includes('FAIL: Refused: expected one mnccore:// URL argument'), logText())
    })

    // Ported from the .bat test: doubled quotes reach the handler as one literal quote.
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
  })

  describe('opaque mnccore:x form (WHATWG does not encode " here)', () => {
    for (const url of ['mnccore:process', 'mnccore:desk/a/b', 'mnccore:launch/lnch_abc', 'mnccore:/process']) {
      it(`is an unknown verb, as in the .bat: ${url}`, () => {
        const r = fire(url)
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('Unknown mnccore:// verb'), r.out)
        assert.ok(!r.out.includes('DRYRUN'), r.out)
      })
    }
  })

  describe('control characters', () => {
    for (const [name, ch] of [['tab', '\t'], ['escape', '\x1b'], ['DEL', '\x7f'], ['SOH', '\x01']]) {
      it(`refuses a URL holding ${name}`, () => {
        const r = fire(`mnccore://desk/a/b${ch}c`)
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('may not contain a control character'), r.out)
      })
    }
  })

  // Ported from the .bat test unchanged in intent.
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
        const p = plan(r.out, 'desk')
        assert.ok(p, r.out)
        assert.match(p.argv[0], /python\.exe$/i)
        assert.deepEqual(p.argv.slice(1), ['-X', 'utf8', resolver, 'desk', ref])
      })
    }

    it('strips one trailing slash like every other verb', () => {
      const r = fire('mnccore://desk/admin-tasks/dom-award-desk/')
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out, 'desk').argv.at(-1), 'admin-tasks/dom-award-desk')
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

    it('a missing resolver is refused', () => {
      const moved = resolver + '.away'
      rmSync(resolver)
      try {
        const r = fire('mnccore://desk/a/b')
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('desk: resolver not found at'), r.out)
      } finally {
        writeFileSync(resolver, '# stub\n')
        rmSync(moved, { force: true })
      }
    })
  })

  describe('launch/<lnch_token>', () => {
    it('routes an opaque token to the resolver', () => {
      const r = fire('mnccore://launch/lnch_abc123')
      assert.equal(r.code, 0, r.out)
      const p = plan(r.out, 'launch-token')
      assert.ok(p, r.out)
      assert.deepEqual(p.argv.slice(1), ['-X', 'utf8', resolver, 'lnch_abc123'])
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

  describe('open/<path>', () => {
    let dir, spaced, amp, file
    before(() => {
      dir = join(home, 'opendir')
      spaced = join(home, 'K proposal')
      amp = join(home, 'R&D, misc')
      for (const d of [dir, spaced, amp]) mkdirSync(d)
      file = join(home, 'opendir', 'run.bat')
      writeFileSync(file, '@exit /b 0\n')
    })
    const fwd = (p) => p.replace(/\\/g, '/')
    const explorer = () => `"${join(sysRoot, 'explorer.exe')}"`

    it('opens a directory with the command line the .bat used', () => {
      const r = fire(`mnccore://open/${fwd(dir)}`)
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out, 'open').cmdline, `${explorer()} "${dir}"`)
    })
    it('decodes file:/// and %20 the way :decode did', () => {
      const r = fire(`mnccore://open/file:///${fwd(spaced).replace(/ /g, '%20')}`)
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out, 'open').cmdline, `${explorer()} "${spaced}"`)
    })
    it('decodes a per-segment-encoded My folder link exactly once (schema-v127)', () => {
      const enc = fwd(amp).split('/').map((s) => (/^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join('/')
      const r = fire(`mnccore://open/${enc}`)
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out, 'open').cmdline, `${explorer()} "${amp}"`)
    })
    for (const [name, tail, why] of [
      ['an encoded quote', '%22%26echo%20x', 'may not contain a double quote'],
      ['an encoded line break', '%0Acalc', 'may not contain a control character'],
    ]) {
      it(`refuses ${name} that appears only after decoding`, () => {
        const r = fire(`mnccore://open/${fwd(dir)}${tail}`)
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes(why), r.out)
        assert.ok(!r.out.includes('DRYRUN'), r.out)
      })
    }
    it('a folder name with & and a comma stays inside one quoted argument', () => {
      const r = fire(`mnccore://open/${fwd(amp)}`)
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out, 'open').cmdline, `${explorer()} "${amp}"`)
    })
    it('refuses a file (the URI-exec residual, #236)', () => {
      const r = fire(`mnccore://open/${fwd(file)}`)
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes('open: refused — target is not a directory'), r.out)
    })
    it('refuses a missing path', () => {
      const r = fire(`mnccore://open/${fwd(join(home, 'nope'))}`)
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes('Path not found'), r.out)
    })
    it('strips trailing backslashes before the checks', () => {
      const r = fire(`mnccore://open/${fwd(dir)}//`)
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out, 'open').cmdline, `${explorer()} "${dir}"`)
    })
    // A stat on \\host\share authenticates to that host. UNC_HOST_ALLOWLIST is
    // empty (no UNC host is in use), so every UNC open is refused as text.
    for (const u of [
      'mnccore://open///localhost/C$',
      'mnccore://open///attacker.example/share/x',
      'mnccore://open///attacker.example@SSL/DavWWWRoot',
      'mnccore://open/\\\\attacker.example\\share',
      'mnccore://open///?/UNC/attacker.example/share',
      'mnccore://open///./C:/Windows',
    ]) {
      it(`refuses an unlisted network host: ${u}`, () => {
        const r = fire(u)
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('open: refused, network host not on the allowlist'), r.out)
      })
    }
    it('refuses a relative path (no drive letter)', () => {
      const r = fire('mnccore://open/Windows')
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes('open: refused, not a local drive path'), r.out)
    })
  })

  describe('file/<path>', () => {
    let box
    before(() => {
      box = join(home, 'Box', 'Grants')
      mkdirSync(join(box, 'sub.pdf'), { recursive: true })
      for (const f of ['doc.pdf', 'DOC2.PDF', 'notes.docx', 'sheet.xlsx', 'macro.docm', 'tool.exe']) {
        writeFileSync(join(box, f), 'x')
      }
      writeFileSync(join(home, 'outside.pdf'), 'x')
    })
    const url = (p) => `mnccore://file/${p.replace(/\\/g, '/')}`

    for (const f of ['doc.pdf', 'DOC2.PDF', 'notes.docx', 'sheet.xlsx']) {
      it(`opens ${f} with its default app`, () => {
        const r = fire(url(join(box, f)))
        assert.equal(r.code, 0, r.out)
        assert.equal(plan(r.out, 'file').startfile, join(box, f))
      })
    }
    for (const [f, msg] of [
      ['macro.docm', 'only .docx .pdf .xlsx'],
      ['tool.exe', 'only .docx .pdf .xlsx'],
      ['sub.pdf', 'target is a directory'],
      ['missing.pdf', 'File not found'],
      ['tool.exe:x.pdf', 'not a plain file path'],
    ]) {
      it(`refuses Box\\Grants\\${f}`, () => {
        const r = fire(url(join(box, f)))
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes(msg), r.out)
      })
    }
    it('refuses a file outside Box', () => {
      const r = fire(url(join(home, 'outside.pdf')))
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes('outside Box'), r.out)
    })
    it('refuses a .. walk out of Box', () => {
      const r = fire(url(join(home, 'Box')) + '/../outside.pdf')
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes('outside Box'), r.out)
    })
  })

  describe('workon/<folder>', () => {
    let proj, ampProj, bare, fake
    before(() => {
      proj = join(home, 'Box', 'Proj One')
      ampProj = join(home, 'Box', 'A&B&echo PWNED')
      bare = join(home, 'Box', 'NoBat')
      fake = join(home, 'Box', 'FakeBat')
      for (const d of [proj, ampProj, bare, join(fake, 'Start Claude.bat')]) mkdirSync(d, { recursive: true })
      writeFileSync(join(proj, 'Start Claude.bat'), '@exit /b 0\n')
      writeFileSync(join(ampProj, 'Start Claude.bat'), '@exit /b 0\n')
      // Every folder workon may open outside the PB repo is a live project's
      // primary_folder in brain.db, in the three stored shapes urlClassify.ts names.
      writeProjects([
        ['active', `file:///${proj.replace(/\\/g, '/').replace(/ /g, '%20')}/`],
        ['active', ampProj],
        ['waiting_external', bare.replace(/\\/g, '/')],
        ['done', fake],
        ['active', join(proj, 'Start Claude.bat')],
      ])
    })
    const url = (p) => `mnccore://workon/${p.replace(/\\/g, '/').replace(/ /g, '%20')}`
    const cmd = join(sysRoot, 'System32', 'cmd.exe')

    it('runs .\\Start Claude.bat with the folder as cwd', () => {
      const r = fire(url(proj))
      assert.equal(r.code, 0, r.out)
      assert.deepEqual(plan(r.out, 'workon'), { argv: [cmd, '/c', '.\\Start Claude.bat'], cwd: proj })
    })
    it('strips a trailing slash', () => {
      const r = fire(url(proj) + '/')
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out, 'workon').cwd, proj)
    })
    it('a folder name holding & never reaches cmd.exe as text', () => {
      const r = fire(url(ampProj))
      assert.equal(r.code, 0, r.out)
      const p = plan(r.out, 'workon')
      assert.deepEqual(p.argv, [cmd, '/c', '.\\Start Claude.bat'])
      assert.equal(p.cwd, ampProj)
    })
    it('refuses a folder without Start Claude.bat', () => {
      const r = fire(url(bare))
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes("workon: no 'Start Claude.bat'"), r.out)
    })
    it('refuses a directory named Start Claude.bat', () => {
      const r = fire(url(fake))
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes("workon: no 'Start Claude.bat'"), r.out)
    })
    it('refuses a non-directory', () => {
      const r = fire(url(join(proj, 'Start Claude.bat')))
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes('workon: not a directory'), r.out)
    })
    it('refuses a Box folder with Start Claude.bat that is no project\'s folder', () => {
      const planted = join(home, 'Box', 'Consortium Share')
      mkdirSync(planted, { recursive: true })
      writeFileSync(join(planted, 'Start Claude.bat'), '@exit /b 0\n')
      const r = fire(url(planted))
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes("workon: refused, not the Peripheral-Brain repo or a project's folder"), r.out)
      assert.ok(!r.out.includes('DRYRUN'), r.out)
    })
    it('refuses a subfolder of a project folder (exact match only)', () => {
      const sub = join(proj, 'sub')
      mkdirSync(sub, { recursive: true })
      writeFileSync(join(sub, 'Start Claude.bat'), '@exit /b 0\n')
      const r = fire(url(sub))
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes("not the Peripheral-Brain repo or a project's folder"), r.out)
    })
    it("refuses a deleted project's folder", () => {
      const gone = join(home, 'Box', 'Deleted Proj')
      mkdirSync(gone, { recursive: true })
      writeFileSync(join(gone, 'Start Claude.bat'), '@exit /b 0\n')
      writeProjects([['active', proj], ['deleted', gone]])
      try {
        const r = fire(url(gone))
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes("not the Peripheral-Brain repo or a project's folder"), r.out)
      } finally {
        writeProjects(PROJECT_ROWS)
      }
    })
    it('refuses when brain.db cannot be read (never falls back to "anywhere under Box")', () => {
      const db = join(home, 'Peripheral-Brain', 'data', 'brain.db')
      const aside = db + '.aside'
      rmSync(aside, { force: true })
      writeFileSync(aside, readFileSync(db))
      rmSync(db)
      try {
        const r = fire(url(proj))
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('cannot read the project list'), r.out)
        writeFileSync(db, 'not a database')
        const r2 = fire(url(proj))
        assert.equal(r2.code, 1, r2.out)
        assert.ok(r2.out.includes('cannot read the project list'), r2.out)
      } finally {
        rmSync(db, { force: true })
        writeFileSync(db, readFileSync(aside))
        rmSync(aside, { force: true })
      }
    })

    // Review 2026-10-09: a share root `\\host\share` made ntpath.dirname keep a
    // trailing backslash, the dirname/cwd compare missed, and the handler fell back
    // to `cmd /c <full path>`, so a share named `a&mkdir X` ran mkdir. Network
    // paths are now refused as text before any stat, and there is no full-path form.
    for (const [name, u] of [
      ['a share root', 'mnccore://workon///localhost/C$'],
      ['a share root holding &', `mnccore://workon///localhost/a&echo PWNED>${MARK}`],
      ['a share root with a trailing slash', 'mnccore://workon///localhost/share/'],
      ['a WebDAV root', 'mnccore://workon///host@SSL/DavWWWRoot'],
      ['a backslash UNC', 'mnccore://workon/\\\\localhost\\C$\\x'],
      ['a file://host form', 'mnccore://workon/file://localhost/C$/x'],
      ['a \\\\?\\UNC device path', 'mnccore://workon///?/UNC/localhost/C$'],
      ['a drive-relative path', 'mnccore://workon/C:Users'],
    ]) {
      it(`refuses ${name} before touching the file system`, () => {
        const r = fire(u)
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('workon: refused, not a local drive path'), r.out)
        assert.ok(!r.out.includes('DRYRUN'), r.out)
        assert.equal(existsSync(MARK), false, `${u} executed: ${r.out}`)
      })
    }

    it('refuses a folder with Start Claude.bat outside PB and Box', () => {
      const out = join(home, 'Elsewhere')
      mkdirSync(out, { recursive: true })
      writeFileSync(join(out, 'Start Claude.bat'), '@exit /b 0\n')
      const r = fire(url(out))
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes("workon: refused, not the Peripheral-Brain repo or a project's folder"), r.out)
    })
    it('refuses a .. walk out of Box', () => {
      const r = fire(url(join(home, 'Box')) + '/../Elsewhere')
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes("not the Peripheral-Brain repo or a project's folder"), r.out)
    })
    it('accepts a folder under the PB repo', () => {
      const pbProj = join(home, 'Peripheral-Brain', 'Projects', 'p1')
      mkdirSync(pbProj, { recursive: true })
      writeFileSync(join(pbProj, 'Start Claude.bat'), '@exit /b 0\n')
      const r = fire(url(pbProj))
      assert.equal(r.code, 0, r.out)
      assert.deepEqual(plan(r.out, 'workon'), { argv: [cmd, '/c', '.\\Start Claude.bat'], cwd: pbProj })
    })

    // Real runs (NOT dry-run), 2026-10-12 security review: a Start Claude.bat or
    // claude.cmd planted in a synced folder must never run. The only thing that
    // appears on the desktop is the project bat's own console, which exits at once.
    describe('real runs: nothing planted runs', () => {
      let listed, good, evil
      before(() => {
        listed = join(home, 'Box', 'Listed Proj')
        mkdirSync(listed, { recursive: true })
        good = join(home, 'GOOD-bat-ran.txt')
        evil = join(home, 'EVIL-ran.txt')
        // The project's own bat calls a bare `claude`, as the real ones do.
        writeFileSync(join(listed, 'Start Claude.bat'), `@echo ran> "${good}"\r\n@call claude 2>nul\r\n@call node --version >nul 2>&1\r\n@exit\r\n`)
        for (const name of ['claude.cmd', 'claude.bat', 'node.cmd', 'node.bat']) {
          writeFileSync(join(listed, name), `@echo ${name}>> "${evil}"\r\n`)
        }
        writeProjects([...PROJECT_ROWS, ['active', listed]])
      })
      after(() => writeProjects(PROJECT_ROWS))
      const reset = () => { rmSync(good, { force: true }); rmSync(evil, { force: true }) }

      it('a planted Start Claude.bat in a Box folder that is no project never runs', () => {
        reset()
        const planted = join(home, 'Box', 'Planted Share')
        mkdirSync(planted, { recursive: true })
        writeFileSync(join(planted, 'Start Claude.bat'), `@echo planted-bat>> "${evil}"\r\n@exit\r\n`)
        // Dry-run: the refusal is the same code before anything launches, and a
        // real refusal would pop the handler's Windows balloon on this desktop.
        const r = fire(url(planted))
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes("workon: refused, not the Peripheral-Brain repo or a project's folder"), r.out)
        assert.ok(!r.out.includes('DRYRUN'), `a launch was planned: ${r.out}`)
        sleepSync(1500)
        assert.equal(existsSync(evil), false, 'the planted bat ran')
      })

      it("a project's folder: its bat runs at once, and its bare claude/node never resolve to the folder", () => {
        reset()
        const r = fireReal(url(listed))
        assert.equal(r.timedOut, false, 'the handler hung')
        assert.equal(r.code, 0, r.out)
        for (let i = 0; i < 60 && !existsSync(good); i++) sleepSync(250)
        assert.equal(existsSync(good), true, "the project's bat never ran")
        sleepSync(1500)
        assert.equal(existsSync(evil), false, existsSync(evil) ? readFileSync(evil, 'utf8') : '')
      })

      it('shows no dialog (Nick 2026-10-12): the handler has no MessageBox call', () => {
        const src = readFileSync(HANDLER, 'utf8')
        assert.ok(!/MessageBoxW|_confirm_workon/.test(src), 'a dialog is back in the PB handler')
      })
    })
  })

  describe('fixed-target verbs', () => {
    const cmd = () => join(sysRoot, 'System32', 'cmd.exe')
    const pb = () => join(home, 'Peripheral-Brain')

    for (const u of ['mnccore://process', 'mnccore://PROCESS', 'mnccore://process/']) {
      it(`${u} runs Quick_Process.bat in PB`, () => {
        const r = fire(u)
        assert.equal(r.code, 0, r.out)
        assert.deepEqual(plan(r.out, 'process'), { argv: [cmd(), '/c', '.\\Quick_Process.bat'], cwd: pb() })
      })
    }
    it('quickchat runs Quick_Chat_seeded.bat in PB', () => {
      const r = fire('mnccore://quickchat')
      assert.equal(r.code, 0, r.out)
      assert.deepEqual(plan(r.out, 'quickchat'), { argv: [cmd(), '/c', '.\\Quick_Chat_seeded.bat'], cwd: pb() })
    })
    // Same .\<basename> + cwd shape as every verb; each bat cd's where it needs to.
    it('bugsquash runs .\\bug-squasher.bat from its own folder', () => {
      const r = fire('mnccore://bugsquash')
      assert.equal(r.code, 0, r.out)
      assert.deepEqual(plan(r.out, 'bugsquash'), { argv: [cmd(), '/c', '.\\bug-squasher.bat'], cwd: HERE })
    })
    it('backlogwave runs .\\backlog-wave.bat from its own folder', () => {
      const r = fire('mnccore://backlogwave')
      assert.equal(r.code, 0, r.out)
      assert.deepEqual(plan(r.out, 'backlogwave'), { argv: [cmd(), '/c', '.\\backlog-wave.bat'], cwd: HERE })
    })
    it('no verb ever puts a path on the cmd.exe line', () => {
      for (const u of ['mnccore://process', 'mnccore://quickchat', 'mnccore://bugsquash', 'mnccore://backlogwave']) {
        const r = fire(u)
        const p = JSON.parse(r.out.match(/^DRYRUN \w+: (.*)$/m)[1])
        assert.match(p.argv[2], /^\.\\[^\\]+\.bat$/, JSON.stringify(p))
      }
    })
    it('process refuses when Quick_Process.bat is missing', () => {
      const qp = join(pb(), 'Quick_Process.bat')
      rmSync(qp)
      try {
        const r = fire('mnccore://process')
        assert.equal(r.code, 1, r.out)
        assert.ok(r.out.includes('process: Quick_Process.bat not found'), r.out)
      } finally {
        writeFileSync(qp, '@exit /b 0\n')
      }
    })
  })

  describe('obsidian/<note> (no CLI shim in the test LOCALAPPDATA, so the protocol path)', () => {
    it('re-encodes spaces into the obsidian:// URI', () => {
      const r = fire('mnccore://obsidian/Projects/x%20y/note')
      assert.equal(r.code, 0, r.out)
      assert.equal(plan(r.out, 'obsidian-proto').startfile,
        'obsidian://open?vault=Peripheral-Brain&file=Projects/x%20y/note')
    })
    it('refuses an empty note', () => {
      const r = fire('mnccore://obsidian//')
      assert.equal(r.code, 1, r.out)
      assert.ok(r.out.includes('obsidian: empty note target'), r.out)
    })
  })

  describe('the real pythonw.exe (no console): exit code + log', () => {
    it('routes a desk ref and logs the plan', () => {
      const r = fire('mnccore://desk/a/pythonw-check', { gui: true })
      assert.equal(r.code, 0)
      assert.ok(logText().includes('DRYRUN desk: '), logText())
      assert.ok(logText().includes('pythonw-check'), logText())
    })
    it('refuses an unknown verb with exit 1 and a FAIL line', () => {
      const r = fire('mnccore://nonesuch/pythonw', { gui: true })
      assert.equal(r.code, 1)
      assert.ok(logText().includes('FAIL: Unknown mnccore:// verb: nonesuch/pythonw'), logText())
    })
  })

  it('an unknown verb exits 1', () => {
    const r = fire('mnccore://nonesuch/x')
    assert.equal(r.code, 1, r.out)
    assert.ok(r.out.includes('Unknown mnccore:// verb'), r.out)
  })
})
