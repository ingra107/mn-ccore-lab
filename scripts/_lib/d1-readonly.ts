/**
 * Guarded read-only D1 helper for one-off report scripts.
 * Runs ONE SELECT through scripts/wrangler-d1 against prod (--remote).
 * Refuses anything that is not a single SELECT statement.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Throws unless `sql` is exactly one SELECT (one optional trailing ';'). */
export function assertSingleSelect(sql: string): string {
  const flat = sql.replace(/\s+/g, ' ').trim().replace(/;\s*$/, '')
  if (!/^select\b/i.test(flat)) throw new Error('read-only: SELECT only')
  // Refuse any ';' at all, even inside a string literal: no report query needs one.
  if (flat.includes(';')) throw new Error('read-only: multiple statements refused')
  return flat
}

export function d1Select<T = Record<string, unknown>>(sql: string): T[] {
  const flat = assertSingleSelect(sql)
  const r = spawnSync(
    'bash',
    ['scripts/wrangler-d1', 'd1', 'execute', 'mnccore-lab', '--remote', '--json', '--command', flat],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  if (r.status !== 0) throw new Error(`wrangler-d1 failed: ${r.stderr || r.stdout}`)
  const parsed = JSON.parse(r.stdout.slice(r.stdout.indexOf('['))) as Array<{ results: T[] }>
  return parsed[0]?.results ?? []
}
