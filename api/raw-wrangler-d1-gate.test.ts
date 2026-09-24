// scripts/check-raw-wrangler-d1.mjs -- the raw `wrangler d1` pre-commit gate
// (PB backlog #2300). Falsified in BOTH directions: prose about the command
// must pass, and a real raw call must still block, or the gate has been made
// blind. Lives under api/ so the api vitest suite (pre-commit + CI) runs it.
//
// Every fixture spells the command as `${WD} execute`, never contiguously: a
// fixture string is CODE to the gate (as it must be -- a command string is
// exactly what it hunts), so writing it out would block this file's own commit.

import { describe, it, expect } from 'vitest'
// @ts-expect-error -- plain .mjs, no type declarations; tests are not typechecked
import { findRawCalls, addedLinesByFile, codeOnly } from '../scripts/check-raw-wrangler-d1.mjs'

const WD = ['wrangler', 'd1'].join(' ')
const all = (text: string) => text.split('\n').map((_, i) => i + 1)
const hits = (path: string, text: string, lines = all(text)): string[] => findRawCalls(path, text, lines)

describe('prose about the command passes', () => {
  it('a Python docstring (the #2231 test-file line 5 shape)', () => {
    const py = `"""Unit test.\n\nRoot cause: \`${WD} execute --json\` writes its error\nPAYLOAD to STDOUT.\n"""\nimport sys\n`
    expect(hits('scripts/test_x.py', py)).toEqual([])
  })

  it('a Python comment and a function docstring', () => {
    const py = `def f():\n    """Calls ${WD} execute through the wrapper."""\n    # ${WD} execute prints to stdout\n    return 1\n`
    expect(hits('scripts/x.py', py)).toEqual([])
  })

  it('TS line and block comments', () => {
    const ts = `// run \`npx ${WD} execute\` by hand\n/*\n * ${WD} export dumps it\n */\nconst x = 1\n`
    expect(hits('api/lib/x.ts', ts)).toEqual([])
  })

  it('a SQL migration header comment', () => {
    const sql = `-- Run with: ${WD} execute mnccore-lab --file=api/schema-v10.sql --remote\nCREATE TABLE t (id TEXT);\n`
    expect(hits('api/schema-v10.sql', sql)).toEqual([])
  })

  it('a full-line shell comment', () => {
    const sh = `#!/usr/bin/env bash\n# never call ${WD} execute directly\nbash scripts/wrangler-d1 d1 execute db --remote\n`
    expect(hits('scripts/run.sh', sh)).toEqual([])
  })

  it('an unchanged line in a staged file is not checked (only ADDED lines)', () => {
    const md = `old: npx ${WD} execute x\nnew line\n`
    expect(hits('docs/x.md', md, [2])).toEqual([])
  })
})

describe('a real raw call still blocks', () => {
  it('a Python subprocess string', () => {
    const py = `import subprocess\nsubprocess.run("npx ${WD} execute mnccore-lab --remote", shell=True)\n`
    expect(hits('scripts/x.py', py)).toEqual([`scripts/x.py:2: subprocess.run("npx ${WD} execute mnccore-lab --remote", shell=True)`])
  })

  it('a Python string continued inside parentheses (not a docstring)', () => {
    const py = `cmd = (\n    "${WD} export mnccore-lab"\n)\n`
    expect(hits('scripts/x.py', py).length).toBe(1)
  })

  it('a Python string after a backslash continuation (not a docstring)', () => {
    expect(hits('scripts/x.py', `cmd = \\\n    "${WD} execute db"\n`).length).toBe(1)
  })

  it('a TS execSync string, even with a URL (// inside a string is not a comment)', () => {
    const ts = `const u = 'https://x'; execSync('npx ${WD} execute db --remote')\n`
    expect(hits('scripts/x.mjs', ts).length).toBe(1)
  })

  it('a shell command line', () => {
    expect(hits('scripts/run.sh', `npx ${WD} execute db --remote --command "SELECT 1"\n`).length).toBe(1)
  })

  it('a markdown doc is scanned whole-line (a doc teaches the command)', () => {
    expect(hits('docs/x.md', `Run \`npx ${WD} execute db\`\n`).length).toBe(1)
  })

  it('the allow marker and the exempt paths still pass', () => {
    expect(hits('docs/x.md', `npx ${WD} execute db  wrangler-d1-allowed\n`)).toEqual([])
    expect(hits('.github/workflows/x.yml', `run: ${WD} execute db\n`)).toEqual([])
  })
})

describe('plumbing', () => {
  it('codeOnly keeps the line count', () => {
    const py = '"""a\nb\nc"""\nx = 1\n'
    expect(codeOnly('x.py', py).split('\n').length).toBe(py.split('\n').length)
  })

  it('addedLinesByFile reads -U0 hunks, including a pure-add and a count-less hunk', () => {
    const diff = [
      'diff --git a/a.py b/a.py', '--- a/a.py', '+++ b/a.py', '@@ -3,0 +4,2 @@', '+x', '+y', '@@ -9 +11 @@', '-a', '+b',
      'diff --git a/n.md b/n.md', 'new file mode 100644', '--- /dev/null', '+++ b/n.md', '@@ -0,0 +1,3 @@', '+1', '+2', '+3',
    ].join('\n')
    const m = addedLinesByFile(diff)
    expect(m.get('a.py')).toEqual([4, 5, 11])
    expect(m.get('n.md')).toEqual([1, 2, 3])
  })

  it('addedLinesByFile reads a spaced name and refuses a header it cannot read', () => {
    expect(addedLinesByFile('+++ b/docs/a b.md\t\n@@ -0,0 +1 @@\n+x').get('docs/a b.md')).toEqual([1])
    expect(() => addedLinesByFile('+++ docs/noprefix.md\n@@ -0,0 +1 @@\n+x')).toThrow(/unreadable diff header/)
  })
})
