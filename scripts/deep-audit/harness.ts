/**
 * Deep-audit harness. Shared helpers for every lifecycle suite.
 *
 * Philosophy: trust nothing.
 *   - Every mutation must be verified via API readback.
 *   - Every UI state change must be verified via reload.
 *   - Every cross-surface claim must be verified by navigating there.
 *
 * Every suite imports from this file. Findings aggregate into review/deep-audit/<run>/findings.md.
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

export const BASE = process.env.DEEP_AUDIT_BASE || 'https://mn-ccore-lab.pages.dev'

export interface AuditSession {
  browser: Browser
  ctx: BrowserContext
  page: Page
  api: APIRequestContext
  runId: string
  outDir: string
  snapCount: { n: number }
  findings: string[]
  bugs: Array<{ id: string; sev: 'P0' | 'P1' | 'P2'; scenario: string; observed: string; expected: string }>
  cleanup: Array<() => Promise<void>>
}

export async function openSession(suiteName: string): Promise<AuditSession> {
  const runId = `${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14)}_${suiteName}`
  const outDir = join('review', 'deep-audit', runId)
  mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  const api = await playwrightRequest.newContext({ baseURL: BASE })

  const session: AuditSession = {
    browser,
    ctx,
    page,
    api,
    runId,
    outDir,
    snapCount: { n: 0 },
    findings: [],
    bugs: [],
    cleanup: [],
  }

  // Capture console + page errors (exclude known noise)
  page.on('pageerror', (err) => {
    const msg = err.message
    if (msg.includes('WebSocket') || msg.includes('hub-realtime')) return
    log(session, `  ⚠ PAGE ERROR: ${msg.slice(0, 200)}`)
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (text.includes('WebSocket') || text.includes('hub-realtime') || text.includes('Failed to load resource')) return
    log(session, `  ⚠ CONSOLE: ${text.slice(0, 200)}`)
  })

  log(session, `\n══════ SUITE: ${suiteName} (run ${runId}) ══════`)
  log(session, `Base: ${BASE}`)

  return session
}

export async function closeSession(s: AuditSession): Promise<void> {
  log(s, `\n──── CLEANUP (${s.cleanup.length} items) ────`)
  for (const fn of s.cleanup.reverse()) {
    try {
      await fn()
    } catch (e) {
      log(s, `  cleanup error: ${(e as Error).message.slice(0, 120)}`)
    }
  }

  const passCount = s.findings.filter((f) => f.includes('[PASS]')).length
  const summary = [
    `# Deep Audit — ${s.runId}`,
    ``,
    `Base: ${BASE}`,
    `Screenshots: ${s.snapCount.n}`,
    `PASS: ${passCount}`,
    `Bugs: ${s.bugs.length} (P0 ${s.bugs.filter((b) => b.sev === 'P0').length}, P1 ${s.bugs.filter((b) => b.sev === 'P1').length}, P2 ${s.bugs.filter((b) => b.sev === 'P2').length})`,
    ``,
    `## Bugs`,
    ``,
    ...s.bugs.map(
      (b) =>
        `- **[${b.id}] [${b.sev}] ${b.scenario}**\n  - Observed: ${b.observed}\n  - Expected: ${b.expected}`,
    ),
    ``,
    `## Full trace`,
    ``,
    ...s.findings,
  ].join('\n')
  writeFileSync(join(s.outDir, 'findings.md'), summary)
  await s.api.dispose()
  await s.browser.close()
  console.log(`\n✓ Suite done. ${s.bugs.length} bugs. ${s.outDir}/findings.md`)
}

export function log(s: AuditSession, msg: string): void {
  console.log(msg)
  s.findings.push(msg)
}

export function pass(s: AuditSession, scenario: string): void {
  s.findings.push(`- [PASS] ${scenario}`)
  console.log(`  ✓ ${scenario}`)
}

export function bug(
  s: AuditSession,
  id: string,
  sev: 'P0' | 'P1' | 'P2',
  scenario: string,
  observed: string,
  expected: string,
): void {
  s.bugs.push({ id, sev, scenario, observed, expected })
  const line = `  ❌ [${id}] [${sev}] ${scenario} | observed=${observed} | expected=${expected}`
  s.findings.push(`- **[${id}] [${sev}] ${scenario}**\n  - Observed: ${observed}\n  - Expected: ${expected}`)
  console.log(line)
}

export async function snap(s: AuditSession, label: string, waitMs = 500): Promise<string> {
  await s.page.waitForTimeout(waitMs)
  s.snapCount.n++
  const name = `${String(s.snapCount.n).padStart(3, '0')}-${label}`
  await s.page.screenshot({ path: join(s.outDir, `${name}.png`), fullPage: false }).catch(() => {})
  return name
}

export function section(s: AuditSession, name: string): void {
  log(s, `\n━━━ ${name} ━━━`)
}

/**
 * Navigate + wait for network idle + short settle.
 */
export async function goto(s: AuditSession, path: string, timeout = 20000): Promise<void> {
  await s.page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout })
  await s.page.waitForTimeout(400)
}

/**
 * Check that an entity (by search marker) IS visible on the current page.
 * Reports pass or bug.
 */
export async function assertVisibleOnPage(
  s: AuditSession,
  bugId: string,
  scenario: string,
  marker: string,
  expected: string,
): Promise<boolean> {
  // .first() to handle multiple matches (same title appearing in multiple surfaces)
  const visible = await s.page.locator(`text=${JSON.stringify(marker)}`).first().isVisible().catch(() => false)
  if (visible) {
    pass(s, scenario)
    return true
  }
  bug(s, bugId, 'P1', scenario, `"${marker}" not visible on ${s.page.url()}`, expected)
  return false
}

/**
 * Check that an entity is NOT visible (e.g. after delete).
 */
export async function assertHiddenOnPage(
  s: AuditSession,
  bugId: string,
  scenario: string,
  marker: string,
  expected: string,
): Promise<boolean> {
  const visible = await s.page.locator(`text=${JSON.stringify(marker)}`).first().isVisible({ timeout: 2000 }).catch(() => false)
  if (!visible) {
    pass(s, scenario)
    return true
  }
  bug(s, bugId, 'P1', scenario, `"${marker}" STILL visible on ${s.page.url()}`, expected)
  return false
}

/**
 * API GET + return typed body.data. Returns null on any failure.
 */
export async function apiGet<T = unknown>(s: AuditSession, path: string): Promise<T | null> {
  try {
    const r = await s.api.get(path)
    if (!r.ok()) return null
    const json = (await r.json()) as { data?: T }
    return json?.data ?? null
  } catch {
    return null
  }
}

/**
 * Hub API uses POST /api/tasks/:id for updates (not PATCH). Shim here so
 * suites express intent (patch semantics) without hardcoding the verb.
 */
export async function apiPatchTask(
  s: AuditSession,
  id: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; status: number }> {
  const r = await s.api.post(`/api/tasks/${id}`, { data: fields })
  return { ok: r.ok(), status: r.status() }
}

/**
 * Hub has no GET /api/tasks/:id — only list endpoint. This helper fetches
 * the full list then finds by id. Heavier than a direct endpoint but the
 * only option until a single-task GET ships.
 */
export async function apiGetTaskFromList<
  T extends { id: string } = { id: string },
>(s: AuditSession, id: string): Promise<T | null> {
  try {
    const r = await s.api.get('/api/tasks')
    if (!r.ok()) return null
    const json = (await r.json()) as { data?: T[] }
    return json?.data?.find((t) => t.id === id) ?? null
  } catch {
    return null
  }
}

/**
 * Same pattern for projects: no GET /api/projects/:slug endpoint, only list.
 */
export async function apiGetProjectFromList<
  T extends { slug: string } = { slug: string },
>(s: AuditSession, slug: string): Promise<T | null> {
  try {
    const r = await s.api.get('/api/projects')
    if (!r.ok()) return null
    const json = (await r.json()) as { data?: T[] }
    return json?.data?.find((p) => p.slug === slug) ?? null
  } catch {
    return null
  }
}

/** Update a project — POST /api/projects/:slug. */
export async function apiPatchProject(
  s: AuditSession,
  slug: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; status: number }> {
  const r = await s.api.post(`/api/projects/${slug}`, { data: fields })
  return { ok: r.ok(), status: r.status() }
}

/**
 * Run an action, reload page, run verify — confirms persistence through reload.
 */
export async function persistThroughReload(
  s: AuditSession,
  bugId: string,
  scenario: string,
  verify: () => Promise<boolean>,
  expected: string,
): Promise<boolean> {
  await s.page.reload({ waitUntil: 'networkidle' })
  await s.page.waitForTimeout(600)
  const ok = await verify()
  if (ok) {
    pass(s, `${scenario} — persists through reload`)
    return true
  }
  bug(s, bugId, 'P1', `${scenario} — persistence check`, 'value reverted or missing after reload', expected)
  return false
}

export const UNIQ = (): string => Math.random().toString(36).slice(2, 8)

/** Build a test marker guaranteed not to collide. */
export function marker(kind: string): string {
  return `test_delete_deep_${kind}_${UNIQ()}`
}
