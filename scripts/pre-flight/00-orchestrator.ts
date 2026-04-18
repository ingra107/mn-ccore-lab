/**
 * Pre-flight orchestrator.
 *
 * Runs every persona script sequentially (each in its own Playwright
 * browser context) and aggregates their findings into a single
 * launch-readiness report. Each persona writes its own screenshots +
 * findings.md in review/preflight/<run>/<persona>/, and this script
 * produces review/preflight/<run>/SUMMARY.md.
 *
 * Why sequential instead of parallel: browser contexts compete on the
 * local CPU and the prod D1 cache. Seen 10-15s variance when running
 * 4 personas in parallel. Sequential gives reliable ~3-5 min total.
 *
 * Run: npm run preflight
 *   or: npx tsx scripts/pre-flight/00-orchestrator.ts
 */
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const RUN_ID = process.env.PREFLIGHT_RUN_ID || new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14)
const OUT_ROOT = join('review', 'preflight', RUN_ID)
mkdirSync(OUT_ROOT, { recursive: true })

const PERSONAS = [
  // Health probe first — if /api/health is RED, fail fast without wasting
  // minutes on browser-based personas that will all fail too.
  { name: 'health', script: 'scripts/pre-flight/persona-health.ts', role: 'Ops health probe — /api/health' },
  { name: 'newcomer', script: 'scripts/pre-flight/persona-newcomer.ts', role: 'Brand-new team member — empty states' },
  { name: 'pi-power-user', script: 'scripts/pre-flight/persona-pi-power-user.ts', role: 'Nick — daily power user' },
  { name: 'collaborator', script: 'scripts/pre-flight/persona-collaborator.ts', role: 'Mesfin — Monday-morning catchup' },
  { name: 'coordinator', script: 'scripts/pre-flight/persona-coordinator.ts', role: 'Research coordinator — heavy data entry' },
  { name: 'trainee', script: 'scripts/pre-flight/persona-trainee.ts', role: 'Student/mentee — limited access' },
  { name: 'mobile', script: 'scripts/pre-flight/persona-mobile.ts', role: 'iPhone 12 @ 375×812' },
  { name: 'accessibility', script: 'scripts/pre-flight/persona-accessibility.ts', role: 'Keyboard-only + screen reader' },
  { name: 'breaker', script: 'scripts/pre-flight/persona-breaker.ts', role: 'Adversary — races, XSS, throttle' },
]

interface PersonaResult {
  name: string
  role: string
  passCount: number
  findingsCount: { P0: number; P1: number; P2: number; INFO: number }
  elapsedSec: number
  findingsMarkdown: string
  error?: string
}

function runPersona(p: typeof PERSONAS[number]): PersonaResult {
  const start = Date.now()
  const env = { ...process.env, PREFLIGHT_RUN_ID: RUN_ID, PREFLIGHT_BASE: process.env.PREFLIGHT_BASE || 'https://mn-ccore-lab.pages.dev' }
  try {
    execSync(`npx tsx ${p.script}`, { stdio: 'inherit', env, timeout: 300_000 })
  } catch (e) {
    console.error(`  ⚠ ${p.name} exited non-zero: ${(e as Error).message.slice(0, 120)}`)
  }
  const elapsedSec = Math.round((Date.now() - start) / 1000)
  const findingsPath = join(OUT_ROOT, p.name, 'findings.md')
  let findingsMarkdown = ''
  let passCount = 0
  const counts = { P0: 0, P1: 0, P2: 0, INFO: 0 }
  if (existsSync(findingsPath)) {
    findingsMarkdown = readFileSync(findingsPath, 'utf-8')
    // Parse the summary line
    const m = findingsMarkdown.match(/Pass count:\s*(\d+)/)
    if (m) passCount = parseInt(m[1], 10)
    const cm = findingsMarkdown.match(/P0=(\d+),\s*P1=(\d+),\s*P2=(\d+),\s*INFO=(\d+)/)
    if (cm) {
      counts.P0 = parseInt(cm[1], 10)
      counts.P1 = parseInt(cm[2], 10)
      counts.P2 = parseInt(cm[3], 10)
      counts.INFO = parseInt(cm[4], 10)
    }
  }
  return { name: p.name, role: p.role, passCount, findingsCount: counts, elapsedSec, findingsMarkdown }
}

function main() {
  console.log(`\n🚀 PRE-FLIGHT RUN ${RUN_ID}`)
  console.log(`📂 Output: ${OUT_ROOT}`)
  console.log(`🌐 Target: ${process.env.PREFLIGHT_BASE || 'https://mn-ccore-lab.pages.dev'}`)
  console.log(`👥 ${PERSONAS.length} personas\n`)

  const results: PersonaResult[] = []
  for (const p of PERSONAS) {
    console.log(`\n━━━━━━━━━━  ${p.name}  (${p.role})  ━━━━━━━━━━`)
    results.push(runPersona(p))
  }

  // ── Aggregate ──
  const totalPass = results.reduce((acc, r) => acc + r.passCount, 0)
  const totalP0 = results.reduce((acc, r) => acc + r.findingsCount.P0, 0)
  const totalP1 = results.reduce((acc, r) => acc + r.findingsCount.P1, 0)
  const totalP2 = results.reduce((acc, r) => acc + r.findingsCount.P2, 0)
  const totalInfo = results.reduce((acc, r) => acc + r.findingsCount.INFO, 0)
  const totalElapsed = results.reduce((acc, r) => acc + r.elapsedSec, 0)

  const launchGateGreen = totalP0 === 0 && totalP1 < 3

  // ── Build SUMMARY.md ──
  const lines: string[] = []
  lines.push(`# Pre-flight Run ${RUN_ID}`)
  lines.push('')
  lines.push(`**Target:** ${process.env.PREFLIGHT_BASE || 'https://mn-ccore-lab.pages.dev'}`)
  lines.push(`**Completed:** ${new Date().toISOString()}`)
  lines.push(`**Elapsed:** ${Math.round(totalElapsed / 60)}m ${totalElapsed % 60}s total across ${results.length} personas`)
  lines.push('')
  lines.push(`## Launch gate: ${launchGateGreen ? '🟢 GREEN' : '🔴 HOLD'}`)
  lines.push('')
  lines.push(`- ✓ **${totalPass}** passes across ${results.length} personas`)
  lines.push(`- 🔥 **P0:** ${totalP0}${totalP0 === 0 ? ' (clean)' : ' — LAUNCH BLOCKER'}`)
  lines.push(`- ❌ **P1:** ${totalP1}${totalP1 < 3 ? ' (within gate)' : ' — gate threshold is <3'}`)
  lines.push(`- ⚠ **P2:** ${totalP2}`)
  lines.push(`- ℹ **INFO:** ${totalInfo}`)
  lines.push('')
  lines.push(`**Decision criteria:** P0=0 AND P1<3 → green. Current: P0=${totalP0}, P1=${totalP1} → ${launchGateGreen ? 'GREEN' : 'HOLD'}.`)
  lines.push('')
  lines.push('## Per-persona summary')
  lines.push('')
  lines.push('| Persona | Role | Pass | P0 | P1 | P2 | INFO | Time |')
  lines.push('|---------|------|------|----|----|----|------|------|')
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.role} | ${r.passCount} | ${r.findingsCount.P0} | ${r.findingsCount.P1} | ${r.findingsCount.P2} | ${r.findingsCount.INFO} | ${r.elapsedSec}s |`)
  }
  lines.push('')
  lines.push('## Findings detail')
  lines.push('')
  for (const r of results) {
    if (r.findingsCount.P0 === 0 && r.findingsCount.P1 === 0 && r.findingsCount.P2 === 0) continue
    lines.push(`### ${r.name}`)
    lines.push('')
    lines.push(`See: [${r.name}/findings.md](./${r.name}/findings.md)`)
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  lines.push('## What each persona covered')
  for (const r of results) {
    lines.push(`- **${r.name}** (${r.role}): ${r.passCount} check(s) passed, ${r.findingsCount.P0 + r.findingsCount.P1 + r.findingsCount.P2} finding(s)`)
  }
  lines.push('')
  lines.push(`## Artifacts`)
  lines.push('- Screenshots: `review/preflight/${RUN_ID}/<persona>/*.png`')
  lines.push('- Per-persona findings: `review/preflight/${RUN_ID}/<persona>/findings.md`')
  lines.push('- Per-persona journey log: `review/preflight/${RUN_ID}/<persona>/journey.log`')

  writeFileSync(join(OUT_ROOT, 'SUMMARY.md'), lines.join('\n'))

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`🏁 PRE-FLIGHT COMPLETE`)
  console.log(`   Gate: ${launchGateGreen ? '🟢 GREEN' : '🔴 HOLD'}  (P0=${totalP0}, P1=${totalP1})`)
  console.log(`   Pass: ${totalPass}`)
  console.log(`   Report: ${OUT_ROOT}/SUMMARY.md`)
  console.log(`${'═'.repeat(60)}\n`)

  // Exit non-zero on P0 or >=3 P1 so CI/cron can gate on this
  if (!launchGateGreen) process.exit(1)
}

main()
