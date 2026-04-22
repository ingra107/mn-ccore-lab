/**
 * Massive E2E audit runner.
 *
 * CLI:
 *   npx tsx scripts/massive-audit/run.ts                          # all sections
 *   npx tsx scripts/massive-audit/run.ts --section=A              # one section
 *   npx tsx scripts/massive-audit/run.ts --section=B,C            # several
 *   npx tsx scripts/massive-audit/run.ts --cleanup-only           # just sweep
 *   npx tsx scripts/massive-audit/run.ts --list                   # show sections
 *
 * Env required:
 *   CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET — CF Access service token
 *   PB_API_KEY (optional) — Bearer for /api/* writes; defaults to live key
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { request as playwrightRequest } from '@playwright/test'
import { loadAuth, browserHeaders } from './lib/auth'
import { finalSweep } from './lib/cleanup'

import { runSectionA } from './sections/A-smoke'
// More section imports added as they're built. To avoid TS errors during
// incremental development, sections that don't exist yet are stubbed.
import { runSectionB } from './sections/B-visual'
import { runSectionC } from './sections/C-entities'
import { runSectionD } from './sections/D-modals'
import { runSectionE } from './sections/E-keyboard'
import { runSectionF } from './sections/F-context-menus'
import { runSectionG } from './sections/G-drag-drop'
import { runSectionH } from './sections/H-realtime'
import { runSectionI } from './sections/I-uploads'
import { runSectionJ } from './sections/J-hermes'
import { runSectionK } from './sections/K-notifications'
import { runSectionL } from './sections/L-search'

type SectionRunner = (runId: string, rootDir: string) => Promise<{ name: string; bugs: number; passes: number }>

const SECTIONS: Record<string, SectionRunner> = {
  A: runSectionA,
  B: runSectionB,
  C: runSectionC,
  D: runSectionD,
  E: runSectionE,
  F: runSectionF,
  G: runSectionG,
  H: runSectionH,
  I: runSectionI,
  J: runSectionJ,
  K: runSectionK,
  L: runSectionL,
}

function parseArgs() {
  const args = process.argv.slice(2)
  const sectionArg = args.find((a) => a.startsWith('--section='))?.split('=')[1]
  const cleanupOnly = args.includes('--cleanup-only')
  const list = args.includes('--list')
  const dryRun = args.includes('--dry-run')
  return {
    sections: sectionArg ? sectionArg.split(',') : Object.keys(SECTIONS),
    cleanupOnly,
    list,
    dryRun,
  }
}

async function main() {
  const opts = parseArgs()

  if (opts.list) {
    console.log('Available sections:')
    Object.keys(SECTIONS).forEach((k) => console.log(`  ${k}`))
    process.exit(0)
  }

  // Validate env early
  loadAuth()

  const runId = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14)
  const rootDir = join('review', 'massive-audit', runId)
  mkdirSync(rootDir, { recursive: true })
  console.log(`\n══════════════════════════════════════════════════════════════════`)
  console.log(`MASSIVE AUDIT — run ${runId}`)
  console.log(`Output: ${rootDir}`)
  console.log(`══════════════════════════════════════════════════════════════════\n`)

  if (opts.cleanupOnly) {
    await runCleanup(runId, rootDir)
    return
  }

  const results: Array<{ name: string; bugs: number; passes: number }> = []
  for (const key of opts.sections) {
    const runner = SECTIONS[key]
    if (!runner) {
      console.log(`\n⚠ Unknown section: ${key} — skipping`)
      continue
    }
    try {
      const res = await runner(runId, rootDir)
      results.push(res)
    } catch (e) {
      console.log(`\n❌ Section ${key} threw: ${(e as Error).message}`)
      results.push({ name: key, bugs: -1, passes: 0 })
    }
  }

  // Final cleanup sweep
  await runCleanup(runId, rootDir)

  // Master report
  const report = renderMasterReport(runId, results)
  writeFileSync(join(rootDir, 'MASTER-REPORT.md'), report)
  console.log(`\n══════════════════════════════════════════════════════════════════`)
  console.log(`Report: ${rootDir}/MASTER-REPORT.md`)
  console.log(`══════════════════════════════════════════════════════════════════\n`)
}

async function runCleanup(runId: string, rootDir: string): Promise<void> {
  const auth = loadAuth()
  const api = await playwrightRequest.newContext({
    baseURL: process.env.MASSIVE_AUDIT_BASE || 'https://mn-ccore-lab.pages.dev',
    extraHTTPHeaders: browserHeaders(auth),
  })
  console.log(`\n──── FINAL CLEANUP SWEEP ────`)
  const report = await finalSweep(api)
  await api.dispose()
  console.log(`  tasks deleted:     ${report.tasksDeleted}`)
  console.log(`  projects deleted:  ${report.projectsDeleted}`)
  console.log(`  ideas deleted:     ${report.ideasDeleted}`)
  console.log(`  decisions deleted: ${report.decisionsDeleted}`)
  console.log(`  questions deleted: ${report.questionsDeleted}`)
  if (report.errors.length) {
    console.log(`  errors:\n    ${report.errors.join('\n    ')}`)
  }
  writeFileSync(join(rootDir, 'cleanup-report.json'), JSON.stringify(report, null, 2))
}

function renderMasterReport(
  runId: string,
  results: Array<{ name: string; bugs: number; passes: number }>,
): string {
  const totalBugs = results.reduce((acc, r) => acc + Math.max(0, r.bugs), 0)
  const totalPass = results.reduce((acc, r) => acc + r.passes, 0)
  const totalThrew = results.filter((r) => r.bugs < 0).length
  const sections = results.length
  const cleanSections = results.filter((r) => r.bugs === 0).length

  const lines = [
    `# MASSIVE AUDIT — Run ${runId}`,
    ``,
    `**Sections run:** ${sections}`,
    `**Sections clean (0 bugs):** ${cleanSections}/${sections}`,
    `**Total PASS findings:** ${totalPass}`,
    `**Total bugs:** ${totalBugs}${totalThrew ? ` (${totalThrew} sections threw exceptions)` : ''}`,
    ``,
    `## Section results`,
    ``,
    `| Section | PASS | BUGS | Status |`,
    `|---|---|---|---|`,
    ...results.map((r) => {
      const status = r.bugs < 0 ? '⚠ THREW' : r.bugs === 0 ? '✓ clean' : `${r.bugs} bug(s)`
      return `| ${r.name} | ${r.passes} | ${r.bugs < 0 ? 'n/a' : r.bugs} | ${status} |`
    }),
    ``,
    `## Cleanup`,
    ``,
    `See \`cleanup-report.json\` for per-entity-type purge counts.`,
    ``,
    `## Per-section findings (drill-down)`,
    ``,
    ...results.map((r) => `- [${r.name}](./${r.name.includes('/') ? r.name : r.name}/findings.md)`),
    ``,
    `## Coverage notes`,
    ``,
    `- **B-visual** sweeps all 41 routes × 6 viewport+theme combos. Per-page table is in B-visual/findings.md. Axe/overlap/console findings persisted to JSON.`,
    `- **C-entities** lifecycle: C1 (task) + C2 (project) full UI inline-edit; C3-C13 lightweight create + API verify.`,
    `- **D-L** scaffolded with representative checks. Each section can be deepened independently via the \`--section\` flag.`,
    ``,
    `## Re-run a single section`,
    ``,
    `\`\`\`bash`,
    `npx tsx scripts/massive-audit/run.ts --section=A`,
    `\`\`\``,
    ``,
    `## Cleanup-only (after a crashed run)`,
    ``,
    `\`\`\`bash`,
    `npx tsx scripts/massive-audit/run.ts --cleanup-only`,
    `\`\`\``,
  ]
  return lines.join('\n')
}

main().catch((e) => {
  console.error(`\nFATAL: ${e.message}`)
  process.exit(1)
})
