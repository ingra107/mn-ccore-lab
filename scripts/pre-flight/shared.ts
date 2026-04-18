/**
 * Pre-flight agent harness — shared helpers.
 *
 * Each persona script imports this to get a consistent session structure,
 * findings writer, screenshot helper, and bug filer. Personas run as
 * independent Playwright browser contexts so they don't contend on cookies,
 * localStorage, or focus state. The orchestrator (00-orchestrator.ts)
 * invokes each persona sequentially or in parallel and merges findings.
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test'
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs'
import { join } from 'path'

export const BASE = process.env.PREFLIGHT_BASE || 'https://mn-ccore-lab.pages.dev'
export const RUN_ID = process.env.PREFLIGHT_RUN_ID || new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14)
export const OUT_ROOT = join('review', 'preflight', RUN_ID)

export type Severity = 'P0' | 'P1' | 'P2' | 'INFO'

export interface Finding {
  persona: string
  id: string
  severity: Severity
  scenario: string
  observed: string
  expected: string
  url?: string
  screenshot?: string
  timestamp: string
}

export interface PersonaSession {
  persona: string
  role: string
  browser: Browser
  ctx: BrowserContext
  page: Page
  api: APIRequestContext
  outDir: string
  snapN: { n: number }
  findings: Finding[]
  passCount: number
  cleanup: Array<() => Promise<void>>
}

export interface PersonaOptions {
  persona: string
  role: string
  viewport?: { width: number; height: number }
  colorScheme?: 'light' | 'dark'
  reducedMotion?: 'reduce' | 'no-preference'
}

export async function openPersona(opts: PersonaOptions): Promise<PersonaSession> {
  mkdirSync(OUT_ROOT, { recursive: true })
  const outDir = join(OUT_ROOT, opts.persona)
  mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    colorScheme: opts.colorScheme ?? 'dark',
    reducedMotion: opts.reducedMotion ?? 'reduce',
  })
  // Persist the theme preference in localStorage so the Hub's useDarkMode
  // hook applies the `.dark` class deterministically. Without this, the
  // hook reads from localStorage first (default 'system') which lands on
  // the prefers-color-scheme fallback — fine, but explicit is better.
  const themePref = opts.colorScheme ?? 'dark'
  await ctx.addInitScript(`window.localStorage.setItem('mn-ccore-theme', '${themePref}');`)
  const page = await ctx.newPage()
  const api = await playwrightRequest.newContext({ baseURL: BASE })

  const session: PersonaSession = {
    persona: opts.persona,
    role: opts.role,
    browser,
    ctx,
    page,
    api,
    outDir,
    snapN: { n: 0 },
    findings: [],
    passCount: 0,
    cleanup: [],
  }

  page.on('pageerror', (err) => {
    const m = err.message
    if (m.includes('WebSocket') || m.includes('hub-realtime')) return
    record(session, {
      id: 'PAGE-ERROR',
      severity: 'P1',
      scenario: 'Uncaught page error during persona journey',
      observed: m.slice(0, 200),
      expected: 'no page errors',
    })
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (text.includes('WebSocket') || text.includes('hub-realtime') || text.includes('Failed to load resource')) return
    record(session, {
      id: 'CONSOLE-ERROR',
      severity: 'P2',
      scenario: 'Console error during persona journey',
      observed: text.slice(0, 200),
      expected: 'no console errors',
    })
  })

  write(session, `\n══════ PERSONA: ${opts.persona} (${opts.role}) ══════`)
  write(session, `Base: ${BASE}`)
  write(session, `Viewport: ${opts.viewport?.width ?? 1440}×${opts.viewport?.height ?? 900}`)
  write(session, `Theme: ${opts.colorScheme ?? 'dark'}`)
  write(session, '')
  return session
}

export async function closePersona(s: PersonaSession): Promise<{ persona: string; findings: Finding[]; passCount: number }> {
  for (const fn of s.cleanup.reverse()) {
    try { await fn() } catch (e) { write(s, `  cleanup err: ${(e as Error).message.slice(0, 120)}`) }
  }
  writeFindingsFile(s)
  await s.api.dispose()
  await s.browser.close()
  return { persona: s.persona, findings: s.findings, passCount: s.passCount }
}

export function write(s: PersonaSession, line: string): void {
  console.log(`[${s.persona}] ${line}`)
  appendFileSync(join(s.outDir, 'journey.log'), line + '\n')
}

export function section(s: PersonaSession, name: string): void {
  write(s, `\n━━━ ${name} ━━━`)
}

export function pass(s: PersonaSession, scenario: string): void {
  s.passCount++
  write(s, `  ✓ ${scenario}`)
}

export function record(s: PersonaSession, f: Omit<Finding, 'persona' | 'timestamp' | 'url'>): void {
  const finding: Finding = {
    persona: s.persona,
    timestamp: new Date().toISOString(),
    url: s.page.url(),
    ...f,
  }
  s.findings.push(finding)
  const sevBadge = f.severity === 'P0' ? '🔥' : f.severity === 'P1' ? '❌' : f.severity === 'P2' ? '⚠' : 'ℹ'
  write(s, `  ${sevBadge} [${f.severity}] ${f.scenario} | observed: ${f.observed.slice(0, 100)} | expected: ${f.expected.slice(0, 100)}`)
}

export async function snap(s: PersonaSession, label: string, waitMs = 400): Promise<string> {
  await s.page.waitForTimeout(waitMs)
  s.snapN.n++
  const name = `${String(s.snapN.n).padStart(3, '0')}-${label}.png`
  await s.page.screenshot({ path: join(s.outDir, name), fullPage: false }).catch(() => {})
  return name
}

export async function goto(s: PersonaSession, path: string, timeout = 20000): Promise<void> {
  try {
    await s.page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout })
    await s.page.waitForTimeout(400)
  } catch (e) {
    // Pages with continuous animations (reagraph, canvas sims) never reach
    // networkidle — fall back to domcontentloaded before flagging. Only
    // records NAV-FAIL if even the DOM parse didn't complete.
    try {
      await s.page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout })
      await s.page.waitForTimeout(1500)
      return
    } catch {
      record(s, {
        id: 'NAV-FAIL',
        severity: 'P1',
        scenario: `Navigate to ${path}`,
        observed: (e as Error).message.slice(0, 200),
        expected: 'page loads within timeout',
      })
    }
  }
}

/** Verify a selector exists and is visible. Records a finding either way. */
export async function assertVisible(
  s: PersonaSession,
  scenario: string,
  selector: string,
  options: { severity?: Severity; timeout?: number } = {},
): Promise<boolean> {
  const { severity = 'P1', timeout = 3000 } = options
  const visible = await s.page.locator(selector).first().isVisible({ timeout }).catch(() => false)
  if (visible) pass(s, scenario)
  else record(s, {
    id: 'NOT-VISIBLE',
    severity,
    scenario,
    observed: `selector "${selector}" not visible`,
    expected: 'selector visible on current page',
  })
  return visible
}

/** Click a selector with the full retry + force-true fallback pattern. */
export async function clickReliable(s: PersonaSession, selector: string, label: string): Promise<boolean> {
  const el = s.page.locator(selector).first()
  if (!(await el.count())) {
    record(s, {
      id: 'CLICK-MISSING',
      severity: 'P1',
      scenario: `Click ${label}`,
      observed: `selector "${selector}" not found`,
      expected: 'element present and clickable',
    })
    return false
  }
  try {
    await el.scrollIntoViewIfNeeded().catch(() => {})
    await el.click({ timeout: 4000 })
    return true
  } catch {
    try {
      await el.click({ force: true, timeout: 3000 })
      return true
    } catch (e) {
      record(s, {
        id: 'CLICK-FAIL',
        severity: 'P1',
        scenario: `Click ${label}`,
        observed: (e as Error).message.slice(0, 160),
        expected: 'click succeeds (normal or force)',
      })
      return false
    }
  }
}

function writeFindingsFile(s: PersonaSession): void {
  const lines: string[] = []
  lines.push(`# Persona: ${s.persona} (${s.role})`)
  lines.push('')
  lines.push(`Base: ${BASE}`)
  lines.push(`Pass count: ${s.passCount}`)
  lines.push(`Findings: ${s.findings.length} (P0=${s.findings.filter(f => f.severity === 'P0').length}, P1=${s.findings.filter(f => f.severity === 'P1').length}, P2=${s.findings.filter(f => f.severity === 'P2').length}, INFO=${s.findings.filter(f => f.severity === 'INFO').length})`)
  lines.push('')
  lines.push('## Findings')
  lines.push('')
  for (const f of s.findings.sort((a, b) => ('P0P1P2INFO'.indexOf(a.severity) - 'P0P1P2INFO'.indexOf(b.severity)))) {
    lines.push(`### [${f.severity}] ${f.scenario}`)
    lines.push(`- id: ${f.id}`)
    lines.push(`- observed: ${f.observed}`)
    lines.push(`- expected: ${f.expected}`)
    if (f.url) lines.push(`- url: ${f.url}`)
    lines.push(`- at: ${f.timestamp}`)
    lines.push('')
  }
  writeFileSync(join(s.outDir, 'findings.md'), lines.join('\n'))
}

/** Marker for test-created rows. */
export function mk(kind: string): string {
  return `test_delete_preflight_${kind}_${Math.random().toString(36).slice(2, 8)}`
}
