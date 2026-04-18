/**
 * Deep audit — Suite 15: Peripheral Brain sync, deep.
 *
 * Suite 6 verified basic Hub → brain.db pull. This goes further:
 *   A. Full task payload round-trip (name, priority, assignee, due_date,
 *      status, key_link_1/_desc) across sync_d1_pull.
 *   B. Reverse: edit in brain.db → sync_d1_push → verify Hub reflects.
 *   C. Comments — are task_comments from Hub visible in brain.db task_comments?
 *   D. Project sync — do Hub projects propagate to brain.db?
 *   E. Field-level LWW — Hub + brain.db edit same field; newer wins.
 *   F. Soft-delete both directions.
 *   G. What DOESN'T sync (decisions, ideas, grants — confirm they're Hub-only).
 *
 * Pre-req: run on the home laptop with brain.db accessible.
 *
 * Run: npx tsx scripts/deep-audit/15-pb-sync-deep.ts
 */
import { openSession, closeSession, section, log, pass, bug, UNIQ } from './harness'
import { execSync } from 'child_process'
import Database from 'better-sqlite3'
import { existsSync } from 'fs'

const PB = process.env.PB_PATH || 'C:/Users/ingra/Peripheral-Brain'
const BRAIN_DB = `${PB}/data/brain.db`

function runPython(rel: string): { ok: boolean; output: string } {
  try {
    const out = execSync(`cd "${PB}" && python ${rel}`, {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000,
    })
    return { ok: true, output: out.slice(-4000) }
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string; message: string }
    const stdout = typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString() || ''
    const stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString() || ''
    return { ok: false, output: `${err.message}\n${stdout}\n${stderr}`.slice(-4000) }
  }
}

interface BrainTask {
  id: string
  name: string
  status: string
  completed: number
  priority: string | null
  assignee: string | null
  due_date: string | null
  project_id: string | null
  task_key_link_1: string | null
  task_key_link_1_desc: string | null
  notes: string | null
  sync_status: string | null
  updated_at: string | null
}

function readBrainTaskByD1Id(d1Id: string): BrainTask | null {
  if (!existsSync(BRAIN_DB)) return null
  const db = new Database(BRAIN_DB, { readonly: true })
  try {
    let row = db.prepare('SELECT id, name, status, completed, priority, assignee, due_date, project_id, task_key_link_1, task_key_link_1_desc, notes, sync_status, updated_at FROM tasks WHERE id = ?').get(d1Id) as BrainTask | undefined
    if (!row) {
      row = db.prepare(`
        SELECT t.id, t.name, t.status, t.completed, t.priority, t.assignee, t.due_date, t.project_id, t.task_key_link_1, t.task_key_link_1_desc, t.notes, t.sync_status, t.updated_at
        FROM tasks t
        JOIN entity_aliases ea ON ea.entity_id = t.id AND ea.entity_type = 'task'
        WHERE ea.alias = ?
      `).get(d1Id) as BrainTask | undefined
    }
    return row ?? null
  } finally {
    db.close()
  }
}

async function main() {
  const s = await openSession('15-pb-sync-deep')
  const createdD1Ids: string[] = []

  try {
    section(s, '15.A  Preflight — brain.db accessible + Python import path')
    if (!existsSync(BRAIN_DB)) {
      bug(s, 'SYNC-NO-DB', 'P0', '15.A brain.db path', BRAIN_DB, 'file exists')
      await closeSession(s); return
    }
    pass(s, `15.A brain.db at ${BRAIN_DB}`)

    // ─────────────────────────────────────────────────────────
    // B. Full task payload round-trip (non-test-prefix to bypass skip filter)
    // ─────────────────────────────────────────────────────────
    section(s, '15.B  Create task in Hub with full payload (name+priority+assignee+due+keylink)')
    const label = `deep-audit-sync-full-${UNIQ()}`
    const due = new Date(); due.setDate(due.getDate() + 14)
    const dueIso = due.toISOString().slice(0, 10)
    const createResp = await s.api.post('/api/tasks', {
      data: {
        title: label,
        description: label,
        assignee: 'nick',
        priority: 'high',
        status: 'todo',
        due_date: dueIso,
        key_link_1: 'https://example.com/deep-sync-full',
        key_link_1_desc: 'Reference link',
      },
    })
    if (!createResp.ok()) {
      bug(s, 'SYNC-HUB-CREATE', 'P0', '15.B POST /api/tasks', `HTTP ${createResp.status()}`, '201')
      await closeSession(s); return
    }
    const d1Id = ((await createResp.json()) as { data?: { id: string } }).data?.id
    if (!d1Id) { await closeSession(s); return }
    createdD1Ids.push(d1Id)
    pass(s, `15.B Hub task ${d1Id} created`)

    // ─────────────────────────────────────────────────────────
    // C. Run sync_d1_pull — verify all fields arrived in brain.db
    // ─────────────────────────────────────────────────────────
    section(s, '15.C  sync_d1_pull brings full payload into brain.db')
    const pull1 = runPython('scripts/db/sync_d1_pull.py')
    if (!pull1.ok) {
      bug(s, 'SYNC-PULL-CRASH', 'P0', '15.C sync_d1_pull clean exit', pull1.output.slice(0, 200), 'exit 0')
    } else {
      pass(s, '15.C sync_d1_pull completed')
      const row = readBrainTaskByD1Id(d1Id)
      if (!row) bug(s, 'SYNC-NOT-INGESTED', 'P0', '15.C task appears in brain.db', 'no row', 'row present')
      else {
        if (row.name === label) pass(s, '15.C name synced')
        else bug(s, 'SYNC-NAME', 'P1', '15.C name mirrored', row.name, label)
        if (row.priority === 'high') pass(s, '15.C priority synced=high')
        else bug(s, 'SYNC-PRI', 'P1', '15.C priority', String(row.priority), 'high')
        if (row.assignee === 'nick') pass(s, '15.C assignee synced=nick')
        else bug(s, 'SYNC-ASG', 'P1', '15.C assignee', String(row.assignee), 'nick')
        if (row.due_date === dueIso) pass(s, `15.C due_date synced=${dueIso}`)
        else bug(s, 'SYNC-DUE', 'P1', '15.C due_date', String(row.due_date), dueIso)
        // key_link
        if (row.task_key_link_1 === 'https://example.com/deep-sync-full') pass(s, '15.C task_key_link_1 synced')
        else bug(s, 'SYNC-KLINK-URL', 'P1', '15.C task_key_link_1 synced', String(row.task_key_link_1), 'https://example.com/deep-sync-full')
        if (row.task_key_link_1_desc === 'Reference link') pass(s, '15.C task_key_link_1_desc synced')
        else bug(s, 'SYNC-KLINK-DESC', 'P1', '15.C task_key_link_1_desc synced', String(row.task_key_link_1_desc), 'Reference link')
      }
    }

    // ─────────────────────────────────────────────────────────
    // D. Reverse leg — edit in brain.db, push, verify Hub
    // ─────────────────────────────────────────────────────────
    section(s, '15.D  brain.db edit → sync_d1_push → Hub')
    const row = readBrainTaskByD1Id(d1Id)
    if (!row) {
      bug(s, 'SYNC-ROW-MISSING-PUSH', 'P0', '15.D brain.db row present before push test', 'row missing', 'row exists')
    } else {
      const newName = `${label}__cli_edit`
      const nowIso = new Date().toISOString()
      const db = new Database(BRAIN_DB)
      try {
        db.prepare("UPDATE tasks SET name = ?, sync_status = 'local_modified', updated_at = ? WHERE id = ?").run(newName, nowIso, row.id)
      } finally { db.close() }
      pass(s, '15.D brain.db UPDATE with sync_status=local_modified')
      // Wait to guarantee updated_at is newer than any Hub-side activity
      await s.page.waitForTimeout(2500)
      const push = runPython('scripts/db/sync_d1_push.py')
      if (!push.ok) {
        bug(s, 'SYNC-PUSH-CRASH', 'P0', '15.D sync_d1_push clean exit', push.output.slice(0, 200), 'exit 0')
      } else {
        pass(s, '15.D sync_d1_push completed')
        // Hub readback
        const listResp = await s.api.get('/api/tasks')
        if (listResp.ok()) {
          const j = (await listResp.json()) as { data?: Array<{ id: string; title: string; description: string }> }
          const hubRow = j.data?.find((t) => t.id === d1Id)
          const field = hubRow?.title ?? hubRow?.description
          if (field === newName) pass(s, '15.D Hub reflects brain.db name after push')
          else bug(s, 'SYNC-PUSH-NOT-PROP', 'P0', '15.D Hub title after push', String(field), newName)
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // E. Comments — do Hub task_comments sync to brain.db?
    // ─────────────────────────────────────────────────────────
    section(s, '15.E  Task comments — Hub → brain.db')
    const cmtText = `${label}__cmt_${UNIQ()}`
    const cmtResp = await s.api.post(`/api/tasks/${d1Id}/comments`, { data: { content: cmtText, author_slug: 'nick' } })
    if (cmtResp.ok()) pass(s, '15.E Hub comment created')
    else log(s, `  15.E comment POST ${cmtResp.status()}`)
    await s.page.waitForTimeout(1500)
    const pullCmt = runPython('scripts/db/sync_d1_pull.py')
    if (pullCmt.ok) {
      if (existsSync(BRAIN_DB)) {
        const db = new Database(BRAIN_DB, { readonly: true })
        try {
          // brain.db doesn't necessarily have a task_comments table — check first
          const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_comments'").get()
          if (!tbl) {
            log(s, '  15.E INFO: brain.db has no task_comments table — Hub task_comments do NOT sync back (by design?)')
          } else {
            const row = db.prepare("SELECT content FROM task_comments WHERE content = ?").get(cmtText)
            if (row) pass(s, '15.E Hub comment found in brain.db task_comments')
            else log(s, '  15.E INFO: Hub comment not in brain.db task_comments — gap (not necessarily bug)')
          }
        } finally { db.close() }
      }
    }

    // ─────────────────────────────────────────────────────────
    // F. Project sync — do Hub-created projects flow to brain.db?
    // ─────────────────────────────────────────────────────────
    section(s, '15.F  Project sync — Hub → brain.db projects table')
    const projTitle = `deep-audit-sync-proj-${UNIQ()}`
    const projResp = await s.api.post('/api/projects', {
      data: { title: projTitle, category: 'lab', status: 'active', stage: 'Idea', description: projTitle, pi: 'nick' },
    })
    if (projResp.ok()) {
      const pslug = ((await projResp.json()) as { data?: { slug: string } }).data?.slug
      pass(s, `15.F Hub project created slug=${pslug}`)
      await s.page.waitForTimeout(1500)
      const pullP = runPython('scripts/db/sync_d1_pull.py')
      if (pullP.ok) {
        const db = new Database(BRAIN_DB, { readonly: true })
        try {
          const row = db.prepare('SELECT id, name FROM projects WHERE name = ? OR slug = ?').get(projTitle, pslug)
          if (row) pass(s, '15.F Hub project found in brain.db projects')
          else log(s, '  15.F INFO: Hub-created project did NOT appear in brain.db — projects are not bidirectional in sync_d1_pull (gap or by design)')
        } finally { db.close() }
      }
      // Cleanup
      if (pslug) s.cleanup.push(async () => { await s.api.post(`/api/projects/${pslug}/delete`).catch(() => {}) })
    }

    // ─────────────────────────────────────────────────────────
    // G. What DOESN'T sync — decisions + ideas + grants on Hub
    // ─────────────────────────────────────────────────────────
    section(s, '15.G  Confirm ideas/decisions/grants are Hub-only (not in brain.db schema)')
    if (existsSync(BRAIN_DB)) {
      const db = new Database(BRAIN_DB, { readonly: true })
      try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
        const tableNames = new Set(tables.map((t) => t.name))
        for (const t of ['ideas', 'decisions', 'decision_log', 'grants', 'lab_questions']) {
          if (tableNames.has(t)) log(s, `  15.G brain.db has table '${t}'`)
          else log(s, `  15.G brain.db missing table '${t}' (Hub-only feature)`)
        }
      } finally { db.close() }
    }

    // ─────────────────────────────────────────────────────────
    // H. Hub → brain.db cleanup path
    // ─────────────────────────────────────────────────────────
    section(s, '15.H  Hub soft-delete → brain.db soft-delete mirror')
    await s.api.post('/api/tasks/batch', { data: { ids: [d1Id], action: 'delete' } })
    await s.page.waitForTimeout(1500)
    const pullDel = runPython('scripts/db/sync_d1_pull.py')
    if (pullDel.ok) {
      const after = readBrainTaskByD1Id(d1Id)
      if (!after) pass(s, '15.H Task removed from brain.db after Hub delete')
      else if (after.status === 'deleted' || after.completed === 1) pass(s, `15.H brain.db soft-deleted (status=${after.status})`)
      else bug(s, 'SYNC-DEL-NO-MIRROR', 'P1', '15.H brain.db mirrors Hub delete', `still present status=${after.status}`, 'row removed or status=deleted')
    }
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const tid of createdD1Ids) {
      s.cleanup.push(async () => {
        await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {})
        if (existsSync(BRAIN_DB)) {
          const db = new Database(BRAIN_DB)
          try {
            const r = db.prepare("DELETE FROM tasks WHERE name LIKE 'deep-audit-sync-full%'").run()
            const r2 = db.prepare("DELETE FROM projects WHERE name LIKE 'deep-audit-sync-proj%'").run()
            console.log(`  cleanup: ${r.changes} tasks + ${r2.changes} projects deleted from brain.db`)
          } finally { db.close() }
        }
      })
    }
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
