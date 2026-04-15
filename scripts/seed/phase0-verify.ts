#!/usr/bin/env tsx
/**
 * Phase 0 post-cleanup residual verifier.
 * Exits 1 if any table has test_delete_ rows after cleanup.
 *
 * Usage: tsx scripts/seed/phase0-verify.ts
 *
 * NOTE on env vars: wrangler is invoked with CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID stripped so it falls back to the OAuth config at
 * ~/.wrangler/config/default.toml. The global env-var token has pages:write
 * scope only; the OAuth config has d1:write and auto-refreshes. Same fix
 * applied to phase0-direct-sql.ts.
 */

import { execSync } from 'node:child_process'

type Check = { table: string; where: string }

const CHECKS: Check[] = [
  { table: 'projects',              where: "title LIKE 'test_delete_%'" },
  { table: 'tasks',                 where: "description LIKE 'test_delete_%' OR title LIKE 'test_delete_%'" },
  { table: 'ideas',                 where: "title LIKE 'test_delete_%'" },
  { table: 'decision_log',          where: "title LIKE 'test_delete_%'" },
  { table: 'meetings',              where: "title LIKE 'test_delete_%'" },
  { table: 'grants',                where: "title LIKE 'test_delete_%'" },
  { table: 'milestones',            where: "title LIKE 'test_delete_%'" },
  { table: 'manuscript_revisions',  where: "notes LIKE 'test_delete_%'" },
  { table: 'research_digest',       where: "title LIKE 'test_delete_%'" },
  { table: 'publications',          where: "title LIKE 'test_delete_%'" },
  { table: 'task_subtasks',         where: "title LIKE 'test_delete_%'" },
  { table: 'task_comments',         where: "content LIKE 'test_delete_%'" },
]

function count(table: string, where: string): number {
  const cmd = `npx wrangler d1 execute mnccore-lab --remote --command "SELECT COUNT(*) AS n FROM ${table} WHERE ${where}" --json`
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_ACCOUNT_ID
  const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env })
  // wrangler prints a banner then the JSON; extract the last JSON array
  const jsonStart = out.indexOf('[')
  const parsed = JSON.parse(out.slice(jsonStart))
  const rows = parsed?.[0]?.results ?? []
  return rows[0]?.n ?? 0
}

function main() {
  let bad = 0
  for (const c of CHECKS) {
    const n = count(c.table, c.where)
    if (n > 0) {
      console.error(`RESIDUE ${c.table}: ${n} rows match '${c.where}'`)
      bad++
    } else {
      console.log(`OK ${c.table}: 0`)
    }
  }
  if (bad > 0) {
    console.error(`\nVERIFY FAILED: ${bad} tables have residue`)
    process.exit(1)
  }
  console.log('\nVERIFY PASSED: 0 residual test_delete_ rows in any table')
}

main()
