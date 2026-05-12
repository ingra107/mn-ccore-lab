// Phase 3.1 detection invariant (2026-05-04):
// Prevents raw INSERT/UPDATE/DELETE on tasks or projects in route files.
// All writes must go through applyMutation() in mutations.ts.
//
// This test is a grep guard — it fails CI if any route file re-introduces
// a direct SQL write to the domain tables, closing the class of bugs that
// Phase 3.1 was designed to eliminate (conflict-semantics bypass).
//
// Exemptions built in:
//  - Lines starting with // or * (comments)
//  - Strings containing 'applyMutation' (the approved path)
//  - handleBatchUpdateTasks / handleAcknowledgeTask bodies (hub-internal
//    multi-row paths; not routable through single-row applyMutation)
//
// Maintenance: if you add a new route file that writes tasks/projects, add it
// to routeFiles below AND route through applyMutation().
// Note: handleSyncBulkTasks deleted 2026-05-12 (codex audit #8); exemption removed.

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const routeFiles = [
  'api/routes/tasks.ts',
  'api/routes/projects.ts',
  'api/routes/pb-sector.ts',
]

// Raw write patterns that are BANNED outside mutations.ts.
const BANNED_PATTERNS = [
  /INSERT\s+INTO\s+tasks\b/i,
  /INSERT\s+INTO\s+projects\b/i,
  /UPDATE\s+tasks\s+SET/i,
  /UPDATE\s+projects\s+SET/i,
  /DELETE\s+FROM\s+tasks\s+WHERE/i,
  /DELETE\s+FROM\s+projects\s+WHERE/i,
]

describe('Phase 3.1 invariant: no raw writes outside mutations.ts', () => {
  for (const file of routeFiles) {
    it(`${file} has no banned raw writes on tasks or projects`, () => {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')

      // Track whether we're inside a batch/bulk function body that is
      // explicitly exempted from the invariant:
      //   - handleBatchUpdateTasks: multi-row IN-clause batch path; per-row
      //     applyMutation conversion deferred (post-Phase-3.1 task).
      //   - handleAcknowledgeTask: writes acknowledged_at/acknowledged_by which
      //     are not in TABLE_FIELDS (hub-internal fields, not synced to PB).
      // (handleSyncBulkTasks deleted 2026-05-12; exemption removed.)
      let insideBulkHandler = false
      let braceDepth = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        // Detect entry into exempted bulk/batch handlers
        if (
          trimmed.includes('async function handleBatchUpdateTasks') ||
          trimmed.includes('async function handleAcknowledgeTask')
        ) {
          insideBulkHandler = true
          braceDepth = 0
        }

        if (insideBulkHandler) {
          // Track brace depth to know when the function ends.
          for (const ch of line) {
            if (ch === '{') braceDepth++
            else if (ch === '}') {
              braceDepth--
              if (braceDepth <= 0) {
                insideBulkHandler = false
                break
              }
            }
          }
          if (insideBulkHandler) continue // skip lines inside bulk handler
        }

        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

        // Exempt: cascade FK-nullification (project cascade-clean NULLs tasks.project_id).
        // This is a multi-row dereference, not a content mutation — not routable
        // through single-row applyMutation. Documented in handleDeleteProject.
        if (trimmed.includes('project_id = NULL')) continue

        // Check each banned pattern
        for (const re of BANNED_PATTERNS) {
          if (re.test(line)) {
            throw new Error(
              `${file}:${i + 1} contains banned raw write (Phase 3.1 invariant violated):\n  ${line.trim()}\n` +
              'Use applyMutation() instead. If this is a legitimate migration path, gate behind HUB_BULK_MIGRATION_MODE=1.'
            )
          }
        }
      }
    })
  }
})
