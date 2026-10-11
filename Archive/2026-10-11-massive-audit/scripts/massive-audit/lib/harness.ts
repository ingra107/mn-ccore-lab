/**
 * Massive-audit harness. Wraps deep-audit's openSession with:
 *   - CF Access service-token + PB_API_KEY Bearer in extraHTTPHeaders
 *   - per-section output dirs (review/massive-audit/<runId>/<section>/)
 *   - viewport + theme controls
 *   - cleanup-callback queue
 *   - per-section sync-relay state (chat-coordinated brain.db verification)
 */
import { chromium, type Browser, type BrowserContext, type Page, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { loadAuth, browserHeaders, type AuditAuth } from './auth'

export const BASE = process.env.MASSIVE_AUDIT_BASE || 'https://mn-ccore-lab.pages.dev'

export type Viewport = 'desktop' | 'tablet' | 'mobile'
export type Theme = 'dark' | 'light'

export const VIEWPORTS: Record<Viewport, { width: number; height: number; deviceScaleFactor?: number }> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812, deviceScaleFactor: 2 },
}

export interface Finding {
  level: 'PASS' | 'FAIL' | 'INFO' | 'BUG'
  id?: string
  sev?: 'P0' | 'P1' | 'P2'
  scenario: string
  observed?: string
  expected?: string
}

export interface Session {
  runId: string
  outDir: string          // per-section dir
  rootDir: string         // top-level run dir (for aggregation)
  section: string
  auth: AuditAuth
  browser: Browser
  ctx: BrowserContext
  page: Page
  api: APIRequestContext
  viewport: Viewport
  theme: Theme
  snapCount: { n: number }
  findings: Finding[]
  cleanup: Array<() => Promise<void>>
}

export interface OpenSessionOpts {
  section: string         // e.g. "A-smoke"
  runId?: string          // share across sections in one run; default new
  viewport?: Viewport     // default 'desktop'
  theme?: Theme           // default 'dark'
  rootDir?: string        // default review/massive-audit/<runId>/
}

export async function openSession(opts: OpenSessionOpts): Promise<Session> {
  const auth = loadAuth()
  const runId = opts.runId ?? `${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14)}`
  const rootDir = opts.rootDir ?? join('review', 'massive-audit', runId)
  const outDir = join(rootDir, opts.section)
  mkdirSync(outDir, { recursive: true })

  const viewport: Viewport = opts.viewport ?? 'desktop'
  const theme: Theme = opts.theme ?? 'dark'

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: VIEWPORTS[viewport].deviceScaleFactor,
    colorScheme: theme,
    reducedMotion: 'reduce',
    extraHTTPHeaders: browserHeaders(auth),
  })

  // Pre-set theme localStorage so SPA renders in target theme on first paint.
  await ctx.addInitScript((themeArg: string) => {
    try {
      localStorage.setItem('mn-ccore-theme', themeArg)
    } catch {
      // localStorage not available pre-navigation; harmless.
    }
  }, theme)

  const page = await ctx.newPage()

  // Console + page error capture (filter font CORS + websocket noise)
  page.on('pageerror', (e) => {
    const m = e.message
    if (m.includes('WebSocket') || m.includes('hub-realtime') || m.includes('partysocket')) return
    console.log(`  PAGE ERROR [${opts.section}/${viewport}/${theme}]: ${m.slice(0, 200)}`)
  })
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (
      t.includes('WebSocket') ||
      t.includes('hub-realtime') ||
      t.includes('Failed to load resource') ||
      t.includes('fonts.gstatic.com') ||
      t.includes('Access to font')
    ) {
      return
    }
    console.log(`  CONSOLE ERR [${opts.section}/${viewport}/${theme}]: ${t.slice(0, 200)}`)
  })

  const api = await playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: browserHeaders(auth),
  })

  const session: Session = {
    runId,
    outDir,
    rootDir,
    section: opts.section,
    auth,
    browser,
    ctx,
    page,
    api,
    viewport,
    theme,
    snapCount: { n: 0 },
    findings: [],
    cleanup: [],
  }

  log(session, `\n══════ SECTION ${opts.section} (${viewport}/${theme}) — run ${runId} ══════`)
  log(session, `Base: ${BASE}`)

  return session
}

export async function closeSession(s: Session): Promise<void> {
  log(s, `\n──── CLEANUP (${s.cleanup.length} callbacks) ────`)
  for (const fn of [...s.cleanup].reverse()) {
    try {
      await fn()
    } catch (e) {
      log(s, `  cleanup error: ${(e as Error).message.slice(0, 200)}`)
    }
  }

  const summary = renderFindings(s)
  writeFileSync(join(s.outDir, 'findings.md'), summary)
  await s.api.dispose()
  await s.browser.close()
  console.log(`\n✓ Section ${s.section} done. ${countBugs(s)} bugs. ${s.outDir}/findings.md`)
}

export function log(s: Session, msg: string): void {
  console.log(msg)
  s.findings.push({ level: 'INFO', scenario: msg })
}

export function pass(s: Session, scenario: string): void {
  s.findings.push({ level: 'PASS', scenario })
  console.log(`  ✓ ${scenario}`)
}

export function bug(
  s: Session,
  id: string,
  sev: 'P0' | 'P1' | 'P2',
  scenario: string,
  observed: string,
  expected: string,
): void {
  s.findings.push({ level: 'BUG', id, sev, scenario, observed, expected })
  console.log(`  ❌ [${id}] [${sev}] ${scenario} | observed=${observed.slice(0, 120)} | expected=${expected.slice(0, 120)}`)
}

export async function snap(s: Session, label: string, waitMs = 400): Promise<string> {
  await s.page.waitForTimeout(waitMs)
  s.snapCount.n++
  const name = `${String(s.snapCount.n).padStart(3, '0')}-${s.viewport}-${s.theme}-${label}`
  await s.page.screenshot({ path: join(s.outDir, `${name}.png`), fullPage: false }).catch(() => {})
  return name
}

export async function goto(s: Session, path: string, timeout = 30000): Promise<void> {
  await s.page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout })
  await s.page.waitForTimeout(400)
}

function countBugs(s: Session): number {
  return s.findings.filter((f) => f.level === 'BUG').length
}

function renderFindings(s: Session): string {
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG')
  const lines: string[] = [
    `# ${s.section} — ${s.viewport}/${s.theme}`,
    ``,
    `Run: ${s.runId}`,
    `Base: ${BASE}`,
    `Screenshots: ${s.snapCount.n}`,
    `PASS: ${passes}`,
    `BUGS: ${bugs.length} (P0 ${bugs.filter((b) => b.sev === 'P0').length}, P1 ${bugs.filter((b) => b.sev === 'P1').length}, P2 ${bugs.filter((b) => b.sev === 'P2').length})`,
    ``,
    `## Bugs`,
    ``,
    ...bugs.map(
      (b) => `- **[${b.id}] [${b.sev}] ${b.scenario}**\n  - Observed: ${b.observed}\n  - Expected: ${b.expected}`,
    ),
    ``,
    `## Trace`,
    ``,
    ...s.findings.map((f) => {
      if (f.level === 'PASS') return `- [PASS] ${f.scenario}`
      if (f.level === 'BUG') return `- [BUG] [${f.id}] [${f.sev}] ${f.scenario}`
      return f.scenario
    }),
  ]
  return lines.join('\n')
}

/** Persist findings as JSONL too — easier to diff across runs. */
export function persistFindingsJson(s: Session): void {
  const lines = s.findings
    .filter((f) => f.level === 'PASS' || f.level === 'BUG')
    .map((f) => JSON.stringify({ section: s.section, viewport: s.viewport, theme: s.theme, ...f }))
  writeFileSync(join(s.outDir, 'findings.jsonl'), lines.join('\n') + '\n')
}
