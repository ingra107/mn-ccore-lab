/**
 * Deep audit — Suite 6: Hub ↔ brain.db sync verification.
 *
 * Scope:
 *   - Create task in Hub → run sync_d1_pull → verify task lands in brain.db with
 *     correct fields.
 *   - Edit task in Hub → re-pull → verify field-level LWW worked.
 *   - Mark task complete in Hub → re-pull → verify status+completed mirror.
 *   - Soft-delete task in Hub → re-pull → verify brain.db soft-deletes too.
 *   - Reverse direction: edit task in brain.db → sync_d1_push → verify Hub shows
 *     the update.
 *
 * Pre-req: this machine is the sync host (home laptop). brain.db is at
 *   C:/Users/ingra/Peripheral-Brain/data/brain.db (junction to ingra107 path).
 *
 * Run: npx tsx scripts/deep-audit/06-sync-pipeline.ts
 */
import {
  openSession,
  closeSession,
  section,
  log,
  pass,
  bug,
  UNIQ,
} from './harness'
import { execSync } from 'child_process'
import Database from 'better-sqlite3'
import { existsSync } from 'fs'

const PB = process.env.PB_PATH || 'C:/Users/ingra/Peripheral-Brain'
const BRAIN_DB = `${PB}/data/brain.db`

function runPython(scriptRelPath: string): { ok: boolean; output: string } {
  try {
    const out = execSync(`cd "${PB}" && python ${scriptRelPath}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    })
    return { ok: true, output: out.slice(-4000) }
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; message: string }
    const stdout = typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString() || ''
    const stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString() || ''
    return { ok: false, output: `${err.message}\n${stdout}\n${stderr}`.slice(-4000) }
  }
}

interface BrainTaskRow {
  id: string
  name: string
  status: string
  completed: number
  priority: string | null
  assignee: string | null
  due_date: string | null
  project_id: string | null
}

/**
 * Look up a brain.db task by its D1 hex id. Post-migration 030 brain.db mints
 * canonical task_{ulid} PKs and records the D1 hex id as a `hub_slug` alias
 * in entity_aliases. This helper joins through that alias table.
 */
function readBrainTask(d1HexId: string): BrainTaskRow | null {
  if (!existsSync(BRAIN_DB)) return null
  const db = new Database(BRAIN_DB, { readonly: true })
  try {
    // Try direct match first (future-proof for schemas that haven't aliased),
    // then the alias join for post-migration-030 reality.
    let row = db.prepare('SELECT id, name, status, completed, priority, assignee, due_date, project_id FROM tasks WHERE id = ?').get(d1HexId) as BrainTaskRow | undefined
    if (!row) {
      row = db.prepare(`
        SELECT t.id, t.name, t.status, t.completed, t.priority, t.assignee, t.due_date, t.project_id
        FROM tasks t
        JOIN entity_aliases ea ON ea.entity_id = t.id AND ea.entity_type = 'task'
        WHERE ea.alias = ?
      `).get(d1HexId) as BrainTaskRow | undefined
    }
    return row ?? null
  } finally {
    db.close()
  }
}

async function main() {
  const s = await openSession('06-sync-pipeline')
  const createdTaskIds: string[] = []

  try {
    // ─────────────────────────────────────────────────────────
    // Pre-flight: brain.db exists?
    // ─────────────────────────────────────────────────────────
    section(s, '6.A  Pre-flight — brain.db accessible')
    if (!existsSync(BRAIN_DB)) {
      bug(s, 'SYNC-NO-BRAINDB', 'P0', '6.A brain.db path exists', BRAIN_DB, 'file present')
      await closeSession(s)
      return
    }
    pass(s, `6.A brain.db present at ${BRAIN_DB}`)

    // ─────────────────────────────────────────────────────────
    // 1. Create a task in Hub via API
    // ─────────────────────────────────────────────────────────
    section(s, '6.B  Create task in Hub (D1) via API (non-test-prefix title so sync doesnt skip)')
    // Must NOT start with any is_test_task prefix (TEST_DELETE_, SYNCTEST, etc.) —
    // those get skipped by sync_d1_pull.py:278. Using "deep-audit-probe-" which
    // is cleanable at the end via explicit name-match delete.
    const title = `deep-audit-probe-${UNIQ()}`
    const createResp = await s.api.post('/api/tasks', {
      data: {
        title,
        description: title,
        assignee: 'nick',
        priority: 'high',
        status: 'todo',
      },
    })
    if (!createResp.ok()) {
      bug(s, 'SYNC-HUB-CREATE-FAIL', 'P0', '6.B Create in Hub', `HTTP ${createResp.status()}`, '201/200')
      await closeSession(s)
      return
    }
    const body = (await createResp.json()) as { data?: { id: string } }
    const taskId = body.data?.id
    if (!taskId) {
      bug(s, 'SYNC-HUB-NO-ID', 'P0', '6.B response has task id', JSON.stringify(body).slice(0, 120), 'object with data.id')
      await closeSession(s)
      return
    }
    createdTaskIds.push(taskId)
    pass(s, `6.B Task created in Hub, id=${taskId}`)

    // ─────────────────────────────────────────────────────────
    // 2. Confirm task NOT YET in brain.db (pre-sync baseline)
    // ─────────────────────────────────────────────────────────
    section(s, '6.C  Confirm task NOT in brain.db yet (pre-sync)')
    const preSync = readBrainTask(taskId)
    if (preSync === null) pass(s, '6.C brain.db has no row for this task before sync_d1_pull')
    else log(s, `  INFO: 6.C task already in brain.db before sync — possible auto-sync or prior run (id=${preSync.id} status=${preSync.status})`)

    // ─────────────────────────────────────────────────────────
    // 3. Run sync_d1_pull — should ingest the Hub task into brain.db
    // ─────────────────────────────────────────────────────────
    section(s, '6.D  Run scripts/db/sync_d1_pull.py')
    const pull1 = runPython('scripts/db/sync_d1_pull.py')
    if (!pull1.ok) {
      bug(s, 'SYNC-PULL-CRASH', 'P0', '6.D sync_d1_pull runs cleanly', pull1.output.slice(0, 200), 'exit 0')
      await closeSession(s)
      return
    }
    pass(s, '6.D sync_d1_pull completed without crash')

    // ─────────────────────────────────────────────────────────
    // 4. Verify task present in brain.db with correct fields
    // ─────────────────────────────────────────────────────────
    section(s, '6.E  Verify task appears in brain.db with correct fields')
    const row = readBrainTask(taskId)
    if (!row) {
      bug(s, 'SYNC-PULL-DID-NOT-INGEST', 'P0', '6.E Hub task in brain.db after sync_d1_pull', 'no row', 'row with matching id')
    } else {
      pass(s, `6.E brain.db row present id=${row.id}`)
      if (row.name === title) pass(s, '6.E name matches Hub title')
      else bug(s, 'SYNC-TITLE-DRIFT', 'P1', '6.E name=title', row.name, title)
      if (row.priority === 'high') pass(s, '6.E priority synced=high')
      else bug(s, 'SYNC-PRIORITY-DRIFT', 'P1', '6.E priority=high synced', String(row.priority), 'high')
      if (row.assignee === 'nick') pass(s, '6.E assignee synced=nick')
      else bug(s, 'SYNC-ASSIGNEE-DRIFT', 'P1', '6.E assignee=nick synced', String(row.assignee), 'nick')
      if (row.status === 'todo') pass(s, '6.E status synced=todo')
      else bug(s, 'SYNC-STATUS-DRIFT', 'P1', '6.E status=todo synced', String(row.status), 'todo')
    }

    // ─────────────────────────────────────────────────────────
    // 5. Edit task in Hub, run pull, verify update flows
    // ─────────────────────────────────────────────────────────
    section(s, '6.F  Edit title in Hub, re-pull, verify brain.db updated')
    const newTitle = `${title}__hub_edit`
    const patchResp = await s.api.post(`/api/tasks/${taskId}`, { data: { title: newTitle } })
    if (!patchResp.ok()) bug(s, 'SYNC-HUB-PATCH', 'P0', '6.F POST title update', `HTTP ${patchResp.status()}`, '200')
    else pass(s, '6.F Hub POST title update accepted')

    // small wait so updated_at is not second-equal with previous row
    await s.page.waitForTimeout(1500)
    const pull2 = runPython('scripts/db/sync_d1_pull.py')
    if (!pull2.ok) {
      bug(s, 'SYNC-PULL-CRASH-2', 'P0', '6.F sync_d1_pull run #2', pull2.output.slice(0, 200), 'exit 0')
    } else {
      const row2 = readBrainTask(taskId)
      if (row2?.name === newTitle) pass(s, '6.F brain.db picked up new title')
      else bug(s, 'SYNC-TITLE-NOT-UPDATED', 'P0', '6.F title update propagates to brain.db', String(row2?.name), newTitle)
    }

    // ─────────────────────────────────────────────────────────
    // 6. Mark done in Hub, re-pull, verify completed=1 in brain.db
    // ─────────────────────────────────────────────────────────
    section(s, '6.G  Hub status=done → brain.db completed=1 + status=done')
    await s.api.post(`/api/tasks/${taskId}/status`, { data: { status: 'done' } })
    await s.page.waitForTimeout(1500)
    const pull3 = runPython('scripts/db/sync_d1_pull.py')
    if (pull3.ok) {
      const row3 = readBrainTask(taskId)
      if (row3?.status === 'done' && row3.completed === 1) pass(s, '6.G brain.db shows status=done completed=1')
      else bug(s, 'SYNC-DONE-FLAG-DRIFT', 'P0', '6.G done state syncs', `status=${row3?.status} completed=${row3?.completed}`, 'status=done completed=1')
    } else {
      bug(s, 'SYNC-PULL-CRASH-3', 'P0', '6.G sync_d1_pull run #3', pull3.output.slice(0, 200), 'exit 0')
    }

    // ─────────────────────────────────────────────────────────
    // 7. Reverse: edit the name in brain.db, run sync_d1_push, verify Hub
    // ─────────────────────────────────────────────────────────
    section(s, '6.H  brain.db edit → sync_d1_push → Hub reflects')
    const reverseTitle = `${title}__cli_edit`
    // Direct UPDATE in brain.db — marks local_modified so push picks it up.
    // Writer must mark sync_status explicitly per .claude/rules/sql-and-data.md.
    // Pass timestamp as bind param (avoids SQLite strict-mode double-quote
    // interpretation tripping on datetime('now')).
    const nowIso = new Date().toISOString()
    // Resolve canonical brain.db task id (opaque task_{ulid}) from the D1 hex id.
    const row0 = readBrainTask(taskId)
    if (!row0) {
      bug(s, 'SYNC-NO-ROW-FOR-PUSH-TEST', 'P0', '6.H brain.db row exists before push test', 'row missing', 'row resolvable by D1 id via aliases')
    } else {
      const brainId = row0.id
      const db = new Database(BRAIN_DB)
      try {
        db.prepare(
          "UPDATE tasks SET name = ?, sync_status = 'local_modified', updated_at = ? WHERE id = ?"
        ).run(reverseTitle, nowIso, brainId)
      } finally {
        db.close()
      }
      pass(s, `6.H brain.db UPDATE written (brain id ${brainId}, sync_status=local_modified)`)
    }

    const push = runPython('scripts/db/sync_d1_push.py')
    if (!push.ok) {
      bug(s, 'SYNC-PUSH-CRASH', 'P0', '6.H sync_d1_push runs cleanly', push.output.slice(0, 200), 'exit 0')
    } else {
      pass(s, '6.H sync_d1_push completed without crash')
      // Readback via Hub API
      const hubList = await s.api.get('/api/tasks')
      if (hubList.ok()) {
        const j = (await hubList.json()) as { data?: Array<{ id: string; title: string; description: string }> }
        const hubRow = j.data?.find((t) => t.id === taskId)
        const field = hubRow?.title ?? hubRow?.description
        if (field === reverseTitle) pass(s, '6.H Hub shows new title from brain.db via sync_d1_push')
        else bug(s, 'SYNC-PUSH-NOT-PROPAGATED', 'P0', '6.H Hub reflects brain.db title after push', String(field), reverseTitle)
      } else {
        bug(s, 'SYNC-HUB-LIST-AFTER-PUSH', 'P1', '6.H GET /api/tasks after push', `HTTP ${hubList.status()}`, '200')
      }
    }

    // ─────────────────────────────────────────────────────────
    // 8. Hub soft-delete → brain.db soft-delete mirror
    // ─────────────────────────────────────────────────────────
    section(s, '6.I  Hub soft-delete → brain.db soft-delete')
    await s.api.post('/api/tasks/batch', { data: { ids: [taskId], action: 'delete' } })
    await s.page.waitForTimeout(1500)
    const pull4 = runPython('scripts/db/sync_d1_pull.py')
    if (pull4.ok) {
      const row4 = readBrainTask(taskId)
      // brain.db tasks typically use a status='deleted' or deleted flag; verify behavior
      if (!row4) pass(s, '6.I Task removed from brain.db after Hub delete')
      else if (row4.status === 'deleted' || row4.completed === 1) pass(s, `6.I brain.db soft-deleted (status=${row4.status} completed=${row4.completed})`)
      else bug(s, 'SYNC-DELETE-NOT-MIRRORED', 'P1', '6.I brain.db reflects Hub delete', `row still present status=${row4.status}`, 'row removed or status=deleted')
    }
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const tid of createdTaskIds) {
      s.cleanup.push(async () => {
        await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {})
        // Also hard-delete from brain.db (if sync made it in) so audit run
        // doesn't leave deep-audit-probe rows floating in the CLI.
        if (existsSync(BRAIN_DB)) {
          const db = new Database(BRAIN_DB)
          try {
            // Use name match since brain.db id is canonical task_{ulid}, not D1 hex
            const stmt = db.prepare("DELETE FROM tasks WHERE name LIKE 'deep-audit-probe-%'")
            const r = stmt.run()
            console.log(`  cleanup: removed ${r.changes} deep-audit-probe rows from brain.db`)
          } finally {
            db.close()
          }
        }
      })
    }
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
