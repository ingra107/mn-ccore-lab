/**
 * Stub helper for sections still under construction. Returns a "skipped"
 * result so the runner doesn't blow up while sections come online.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export function makeStub(name: string) {
  return async (runId: string, rootDir: string) => {
    const dir = join(rootDir, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'findings.md'),
      `# ${name} — STUB\n\nSection scaffolded, implementation pending.\n`,
    )
    console.log(`  [SKIP] ${name} (stub)`)
    return { name, passes: 0, bugs: 0 }
  }
}
