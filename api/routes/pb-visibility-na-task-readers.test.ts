// #8842 R6 — ratchet on routes that read TASK rows with no PB-visibility gate.
//
// `visibility: 'na'` in the route registry is a label nothing checked: the
// meeting detail and calendar routes both said 'na' while returning
// PB-private task rows to every authed caller. This walks ROUTE_REGISTRY,
// resolves each handler to the route-module function it calls, and flags a
// non-PI, non-'pb-aware' route whose function reads `FROM tasks` / `JOIN
// tasks` without naming any visibility primitive.
//
// Level 2 and heuristic (source text, not data flow): SQL assembled through a
// helper hides from it, and a primitive named in a comment satisfies it. What
// it does do: a NEW task-reading route that forgets the filter fails here, and
// a baselined route that gains a gate must leave the baseline (so the list
// only shrinks). The baseline below is the offender list as of 2026-09-23;
// each still needs a verdict (real leak, count-only, own-rows-only, or a
// false positive). It is not a list of confirmed leaks.

import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTE_REGISTRY } from '../lib/route-dsl'
import '../index'

const VISIBILITY_PRIMITIVE =
  /assertProjectVisible|canSeePbProject|pbTaskVisibilitySql|withProjectWrite|withExistingRowProject|isPiRequest|canSeePb|Peripheral Brain/

const UNCLASSIFIED_BASELINE = new Set([
  'GET /api/activity/heatmap',
  'GET /api/analytics/contributions',
  'GET /api/analytics/pi-dashboard',
  'GET /api/analytics/response-time',
  'GET /api/meetings/cadence-check',
  'GET /api/proactive-brief',
  'GET /api/seen/unseen',
  'GET /api/tasks/:id/detail',
  'GET /api/tasks/overdue-count',
  'GET /api/team/:slug/contributions',
  'GET /api/team/:slug/trajectory',
  'GET /api/team/pulse',
  'POST /api/sync/mobile-tasks-to-hub',
  'POST /api/tasks',
  'POST /api/tasks/:id/handoffs',
  'POST /api/tasks/batch',
])

async function routeModuleFunctions(): Promise<Map<string, string>> {
  const fns = new Map<string, string>()
  for (const f of readdirSync(__dirname)) {
    if (!f.endsWith('.ts') || f.includes('.test.')) continue
    const mod = (await import(join(__dirname, f))) as Record<string, unknown>
    for (const [name, v] of Object.entries(mod)) {
      if (typeof v === 'function') fns.set(name, (v as (...a: unknown[]) => unknown).toString())
    }
  }
  return fns
}

describe("routes that read tasks declare or apply PB visibility", () => {
  it("no ungated task reader outside the baseline; no baseline entry that is now gated", async () => {
    const fns = await routeModuleFunctions()
    const offenders = new Set<string>()
    for (const r of ROUTE_REGISTRY) {
      if (r.visibility === 'pb-aware' || r.auth === 'pi') continue
      const called = new Set([...r.handler.toString().matchAll(/\b(handle[A-Z]\w*)\b/g)].map((m) => m[1]))
      for (const name of called) {
        const src = fns.get(name)
        if (!src) continue
        if (/\b(FROM|JOIN)\s+tasks\b/i.test(src) && !VISIBILITY_PRIMITIVE.test(src)) {
          offenders.add(`${r.method} ${r.path}`)
        }
      }
    }
    const added = [...offenders].filter((k) => !UNCLASSIFIED_BASELINE.has(k)).sort()
    const cleared = [...UNCLASSIFIED_BASELINE].filter((k) => !offenders.has(k)).sort()
    expect(added, 'new route reads tasks with no PB-visibility gate: filter with pbTaskVisibilitySql and tag it pb-aware').toEqual([])
    expect(cleared, 'these baseline routes are gated now; delete them from UNCLASSIFIED_BASELINE').toEqual([])
  })

  it('the two #8842 routes are pb-aware now', () => {
    const tags = new Map(ROUTE_REGISTRY.map((r) => [`${r.method} ${r.path}`, r.visibility]))
    expect(tags.get('GET /api/meetings/:id')).toBe('pb-aware')
    expect(tags.get('GET /api/calendar/events')).toBe('pb-aware')
  })
})
