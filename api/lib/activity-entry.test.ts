// activity-entry.test.ts — contract tests for the unified-timeline write
// primitive (postActivityEntry) + read projections (Design C, schema-v77).
//
// Uses an in-memory activity_entries store keyed by the SQL signatures the
// primitive + the retargeted handlers emit. Covers:
//   - @me prefix strips + visibility gate (author sees own, other doesn't, API-key/PI sees all)
//   - kind / update_type validation rejects
//   - idempotent re-insert returns existing (no dup)
//   - projection shapes match the old endpoint field names byte-for-byte
//   - task delete cascade removes activity_entries rows
//   - Hermes placeholder lands as an activity entry
//   - project feed includes task rows by project_id

import { describe, it, expect } from 'vitest'
import type { AuthUser, Env } from '../helpers'
import { postActivityEntry } from './activity-entry'
import {
  handleGetTaskComments,
  handleGetTaskUpdates,
  handleAddTaskComment,
  handlePostTaskUpdate,
  handleDeleteTask,
  handleGetTaskActivity,
} from '../routes/tasks'
import { handleGetProjectActivity, handleAddComment, handlePostProjectUpdate, handleGetComments, handleGetProjectUpdates } from '../routes/projects'
import { handleDeleteActivityEntry, handleEditActivityEntry, handleSetActivityHidden } from '../routes/activity'
import { handleGetDayActivity, handlePostDayActivity } from '../routes/days'

const TEST_MODE_KEY = 'local-test-key-do-not-use-in-prod'
const PI_EMAIL = 'ingra107@umn.edu'
const NON_PI_EMAIL = 'nate@umn.edu'
const NICK: AuthUser = { email: PI_EMAIL, name: 'Nick' }
const NATE: AuthUser = { email: NON_PI_EMAIL, name: 'Nate' }

// ── In-memory model ────────────────────────────────────────────────────────────

interface AERow {
  id: string
  entity_type: string
  entity_id: string
  project_id: string | null
  kind: string
  visibility: string
  actor_slug: string
  body: string
  mentions_json: string | null
  update_type: string | null
  metadata_json: string | null
  source_table: string | null
  source_id: string | null
  /** #98: NULL for a thread root, the root's id for a reply. */
  parent_id?: string | null
  /** v102: NULL = visible; a timestamp = dismissed (Hermes wave Phase 2). */
  hidden_at?: string | null
  created_at: string
}

/** Newest-first by (created_at, id) — the compound cursor order every feed uses. */
const byCreatedDesc = (a: AERow, b: AERow) =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1

interface Fixtures {
  tasks: Record<string, {
    project_id: string | null; deleted_at?: string | null; title?: string; assignee?: string | null
    // key_link slots — the artifact at-source comment-path hook reads/writes these.
    key_link_1?: string | null; key_link_2?: string | null; key_link_3?: string | null
    key_link_1_desc?: string | null; key_link_2_desc?: string | null; key_link_3_desc?: string | null
  }>
  projects: Record<string, { id: string; slug: string | null; category: string | null }>
  // artifacts keyed by art_ id → { title } for the key_link desc lookup.
  artifacts: Record<string, { title: string | null }>
  teamSlugs: Set<string>
}

function makeEnv(fx: Partial<Fixtures> = {}) {
  const ae: AERow[] = []
  const notifications: Array<Record<string, unknown>> = []
  const aiRequests: Array<Record<string, unknown>> = []
  let clock = 0
  const tasks = fx.tasks ?? {}
  const projects = fx.projects ?? {}
  const artifacts = fx.artifacts ?? {}
  const teamSlugs = fx.teamSlugs ?? new Set(['nick-ingraham', 'nate-mesfin'])

  // Resolve a project ref (id or slug) → canonical id.
  function projCanon(ref: string): string | null {
    for (const p of Object.values(projects)) {
      if (p.id === ref || p.slug === ref) return p.id
    }
    return null
  }

  // Shared insert used by both the INSERT...run() path (backfill / OR IGNORE) and
  // the INSERT...RETURNING *.first() path (normal write). Returns the new row.
  function insertActivityEntry(binds: any[]): AERow {
    // parent_id is the 14th bind (#98), hidden_at the 15th (v102) — positional,
    // matching the column list in api/lib/activity-entry.ts. Keep these in
    // lockstep: a silently-dropped trailing bind here would make every reply look
    // like a root (or every dismissed thread look visible) in tests.
    const [id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, source_table, source_id, parent_id, hidden_at] = binds
    const row: AERow = {
      id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body,
      mentions_json, update_type, metadata_json, source_table, source_id,
      parent_id: parent_id ?? null,
      hidden_at: hidden_at ?? null,
      created_at: `2026-06-10 00:00:0${clock++}`,
    }
    ae.push(row)
    return row
  }

  function applyVisibilityFilter(rows: AERow[], sql: string, binds: unknown[]): AERow[] {
    // The gate clause is one of:
    //   1=1                                  (PI/API-key — all)
    //   visibility = 'team'                  (unauthed — team only)
    //   (... visibility = 'team' OR ... actor_slug = ?)   (browser actor)
    // We detect the actor-slug arm by presence of "actor_slug = ?" near the gate.
    if (/visibility = 'team' OR/.test(sql) || /\.visibility = 'team' OR/.test(sql)) {
      const slug = binds[binds.length - 1] as string // gate slug is last positional in our calls
      // NOTE: our handlers always append the gate binds LAST, but recent-* feeds
      // don't use the actor-slug arm. For per-task reads the slug is the final bind.
      return rows.filter(r => r.visibility === 'team' || r.actor_slug === slug)
    }
    if (/visibility = 'team'/.test(sql) && !/OR/.test(sql)) {
      return rows.filter(r => r.visibility === 'team')
    }
    return rows
  }

  const env = {
    TEST_MODE_KEY,
    PB_API_KEY: 'valid-test-api-key',
    DB: {
      prepare: (sql: string) => {
        let binds: unknown[] = []
        const stmt: any = {
          bind: (...args: unknown[]) => { binds = [...binds, ...args]; return stmt },
          first: async () => {
            if (/pi_emails/.test(sql)) return { value: JSON.stringify([PI_EMAIL]) }
            if (/FROM team_members WHERE slug = \?/.test(sql)) {
              return teamSlugs.has(binds[0] as string) ? { 1: 1 } : null
            }
            if (/SELECT project_id, assignee, title FROM tasks WHERE id = \?/.test(sql)) {
              const t = tasks[binds[0] as string]
              return t && t.deleted_at == null
                ? { project_id: t.project_id, assignee: t.assignee ?? null, title: t.title ?? '' }
                : null
            }
            // Artifact at-source hook: slot state read (key_link_1/2/3).
            if (/SELECT key_link_1, key_link_2, key_link_3 FROM tasks WHERE id = \? AND deleted_at IS NULL/.test(sql)) {
              const t = tasks[binds[0] as string]
              if (!t || t.deleted_at != null) return null
              return {
                key_link_1: t.key_link_1 ?? null,
                key_link_2: t.key_link_2 ?? null,
                key_link_3: t.key_link_3 ?? null,
              }
            }
            // Artifact at-source hook: title lookup for the key_link description.
            if (/SELECT title FROM artifacts WHERE id = \?/.test(sql)) {
              const a = artifacts[binds[0] as string]
              return a ? { title: a.title } : null
            }
            // Owner re-notification lookup (2026-06-11): assignee + title.
            if (/SELECT assignee, title FROM tasks WHERE id = \? AND deleted_at IS NULL/.test(sql)) {
              const t = tasks[binds[0] as string]
              if (!t || t.deleted_at != null) return null
              return { assignee: t.assignee ?? null, title: t.title ?? '' }
            }
            if (/FROM tasks WHERE id = \? AND deleted_at IS NULL/.test(sql)) {
              const t = tasks[binds[0] as string]
              if (!t || t.deleted_at != null) return null
              return { id: binds[0], project_id: t.project_id, description: '', title: t.title ?? '', deleted_at: null }
            }
            if (/SELECT title FROM tasks WHERE id = \?/.test(sql)) {
              const t = tasks[binds[0] as string]
              return t ? { title: t.title ?? '' } : null
            }
            if (/SELECT \* FROM tasks WHERE id = \?/.test(sql)) {
              const t = tasks[binds[0] as string]
              if (!t) return null
              return { id: binds[0], title: t.title ?? '', description: '', project_id: t.project_id, deleted_at: t.deleted_at ?? null, assignee: 'nick-ingraham' }
            }
            // handleDeleteTask's existence probe (explicit column list, reads soft-deleted too).
            if (/SELECT id, title, description, deleted_at, project_id FROM tasks WHERE id = \?/.test(sql)) {
              const t = tasks[binds[0] as string]
              if (!t) return null
              return { id: binds[0], title: t.title ?? '', description: '', deleted_at: t.deleted_at ?? null, project_id: t.project_id }
            }
            if (/SELECT id FROM projects WHERE id = \? LIMIT 1/.test(sql)) {
              const c = projCanon(binds[0] as string)
              return c ? { id: c } : null
            }
            if (/FROM projects WHERE \(id = \? OR slug = \?\)/.test(sql) || /FROM projects WHERE id = \? OR slug = \?/.test(sql)) {
              const c = projCanon(binds[0] as string)
              if (!c) return null
              const p = Object.values(projects).find(x => x.id === c)!
              return { id: p.id, slug: p.slug, category: p.category }
            }
            // Non-source insert path: `INSERT INTO activity_entries ... RETURNING *`
            // resolved via .first() (real D1 supports RETURNING; mirror the run()
            // insert and return the new row). No conflict possible on this path.
            if (/INSERT INTO activity_entries/.test(sql) && /RETURNING \*/.test(sql)) {
              return insertActivityEntry(binds as any[])
            }
            if (/SELECT \* FROM activity_entries WHERE id = \?/.test(sql)) {
              return ae.find(r => r.id === binds[0]) ?? null
            }
            // handleDeleteActivityEntry auth probe + idempotentDelete's hard-mode
            // project-gate probe (explicit column lists, WHERE id = ?).
            // #98 parent resolution inside postActivityEntry. Its own column
            // list, so it needs its own branch — the doubles match on the exact
            // SELECT, and an unmatched read returns null, which postActivityEntry
            // correctly reads as "parent not found" and 404s.
            if (/SELECT id, parent_id, entity_type, entity_id, kind, visibility, hidden_at FROM activity_entries WHERE id = \?/.test(sql)) {
              const r = ae.find(x => x.id === binds[0])
              return r ? {
                id: r.id, parent_id: r.parent_id ?? null, entity_type: r.entity_type,
                entity_id: r.entity_id, kind: r.kind, visibility: r.visibility,
                hidden_at: r.hidden_at ?? null,
              } : null
            }
            if (/SELECT id, actor_slug FROM activity_entries WHERE id = \?/.test(sql)) {
              const r = ae.find(x => x.id === binds[0])
              return r ? { id: r.id, actor_slug: r.actor_slug } : null
            }
            // handleEditActivityEntry auth+kind probe.
            if (/SELECT id, actor_slug, kind, metadata_json FROM activity_entries WHERE id = \?/.test(sql)) {
              const r = ae.find(x => x.id === binds[0])
              return r ? { id: r.id, actor_slug: r.actor_slug, kind: r.kind, metadata_json: r.metadata_json } : null
            }
            // handleSetActivityHidden auth+root probe (v102).
            if (/SELECT id, actor_slug, parent_id, kind FROM activity_entries WHERE id = \?/.test(sql)) {
              const r = ae.find(x => x.id === binds[0])
              return r ? { id: r.id, actor_slug: r.actor_slug, parent_id: r.parent_id ?? null, kind: r.kind } : null
            }
            // handleEditActivityEntry body update (RETURNING * via .first()).
            if (/UPDATE activity_entries SET body = \?, metadata_json = \? WHERE id = \? RETURNING \*/.test(sql)) {
              const r = ae.find(x => x.id === binds[2])
              if (!r) return null
              r.body = binds[0] as string
              r.metadata_json = binds[1] as string
              return { ...r }
            }
            if (/SELECT id, project_id FROM activity_entries WHERE id = \?/.test(sql)) {
              const r = ae.find(x => x.id === binds[0])
              return r ? { id: r.id, project_id: r.project_id } : null
            }
            if (/FROM activity_entries WHERE source_table = \? AND source_id = \?/.test(sql)) {
              return ae.find(r => r.source_table === binds[0] && r.source_id === binds[1]) ?? null
            }
            return null
          },
          all: async () => {
            // dispatchHermes transcript (#98 multi-turn memory). Thread-scoped
            // `(ae.id = ?1 OR ae.parent_id = ?1)` or day-scoped
            // `ae.entity_type = 'day' AND ae.entity_id = ?1`.
            //
            // MUST be tested BEFORE the day-feed branch: that branch's regex
            // (`entity_type = 'day' AND ae.entity_id = ?`) also matches the
            // day-scoped transcript, and it sorts newest-first through a
            // different visibility helper — so a transcript assertion would be
            // reading a feed projection, not the transcript. Until this branch
            // existed at all the query fell through to the empty default, so
            // every transcript assertion passed against zero rows. That is how
            // "Hermes forgets its own prior answer" shipped unnoticed.
            if (/FROM activity_entries ae/.test(sql) && /ae\.body != \?/.test(sql) && /ORDER BY ae\.created_at ASC/.test(sql)) {
              const [scopeBind, excludeId, pendingBody, requester] = binds as [string, string, string, string]
              const dayScoped = /ae\.entity_type = 'day'/.test(sql)
              let rows = dayScoped
                ? ae.filter(r => r.entity_type === 'day' && r.entity_id === scopeBind)
                : ae.filter(r => r.id === scopeBind || r.parent_id === scopeBind)
              rows = rows.filter(r => r.id !== excludeId && r.kind === 'comment' && r.body !== pendingBody)
              // The visibility gate, READ OFF THE SQL rather than hardcoded. The
              // root arm applies only when the statement actually carries the
              // EXISTS sub-select — otherwise a double that always ran three
              // arms would keep these tests green even if the arm were deleted
              // from the product, which is the definition of a proxy artifact.
              const hasRootArm = /EXISTS \(\s*SELECT 1 FROM activity_entries r/.test(sql)
                && /r\.visibility = 'author'/.test(sql)
                && /r\.actor_slug = \?/.test(sql)
              rows = rows.filter((r) => {
                if (r.visibility === 'team') return true
                if (r.actor_slug === requester) return true
                if (!hasRootArm) return false
                const root = ae.find(x => x.id === (r.parent_id ?? r.id))
                return !!root && root.visibility === 'author' && root.actor_slug === requester
              })
              rows = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1))
              return { results: rows.map(r => ({ actor_slug: r.actor_slug, body: r.body, created_at: r.created_at })) }
            }
            // Per-task projections (comments / updates / activity / detail-updates).
            // The `(ae\.)?` tolerance matches what the project branches below
            // already do: handleGetTaskActivity qualifies its columns because it
            // joins a correlated reply-count subquery (#98), the other task
            // projections don't.
            if (/FROM activity_entries/.test(sql) && /(ae\.)?entity_type = 'task' AND (ae\.)?entity_id = \?/.test(sql)) {
              // Do NOT assume binds[0]. A leading subquery contributes its own
              // gate binds BEFORE the task id, so the id's position depends on
              // the statement. Count the placeholders that precede it — exact
              // for every shape, and still 0 for the un-prefixed projections.
              const marker = sql.indexOf('entity_id = ?')
              const taskIdIdx = (sql.slice(0, marker).match(/\?/g) || []).length
              const taskId = binds[taskIdIdx] as string
              let rows = ae.filter(r => r.entity_type === 'task' && r.entity_id === taskId)
              if (/kind = 'comment'/.test(sql)) rows = rows.filter(r => r.kind === 'comment')
              if (/kind = 'update'/.test(sql)) rows = rows.filter(r => r.kind === 'update')
              // #98: roots-only feeds. Without this a reply would surface in the
              // unified feed here but not in prod — the double hiding a bug.
              if (/parent_id IS NULL/.test(sql)) rows = rows.filter(r => !r.parent_id)
              rows = applyVisibilityFilter(rows, sql, binds)
              rows = [...rows].sort(byCreatedDesc)
              return { results: rows.map(r => projectRowForSql(sql, r)) }
            }
            // Day feed (Phase 3): WHERE entity_type = 'day' AND ae.entity_id = ? —
            // roots only, mirrors the task branch's bind-counting (a leading
            // reply_count subquery contributes its gate binds before the date).
            if (/FROM activity_entries/.test(sql) && /entity_type = 'day' AND ae\.entity_id = \?/.test(sql)) {
              const marker = sql.indexOf('entity_id = ?')
              const dateIdx = (sql.slice(0, marker).match(/\?/g) || []).length
              const dateKey = binds[dateIdx] as string
              let rows = ae.filter(r => r.entity_type === 'day' && r.entity_id === dateKey)
              if (/parent_id IS NULL/.test(sql)) rows = rows.filter(r => !r.parent_id)
              rows = applyVisibilityFilter(rows, sql, binds)
              rows = [...rows].sort(byCreatedDesc)
              return { results: rows.map(r => projectRowForSql(sql, r)) }
            }
            // Project feed: WHERE project_id = ?  — single-predicate (project-entity
            // rows store project_id = entity_id, so this captures both project-level
            // rows AND task rows rolled up by project_id).
            // Project-entity projections (P2-A): comments / updates over
            // activity_entries with the legacy shapes.
            if (/FROM activity_entries/.test(sql) && /entity_type = 'project' AND ae\.entity_id = \?/.test(sql)) {
              const projId = binds[0] as string
              let rows = ae.filter(r => r.entity_type === 'project' && r.entity_id === projId)
              if (/kind = 'comment'/.test(sql)) rows = rows.filter(r => r.kind === 'comment')
              if (/kind = 'update'/.test(sql)) rows = rows.filter(r => r.kind === 'update')
              rows = applyVisibilityFilter(rows, sql, binds)
              rows = [...rows].sort(byCreatedDesc)
              if (/AS author_id|author_id/.test(sql)) {
                // comments projection shape
                return { results: rows.map(r => ({
                  id: r.id, content: r.body, created_at: r.created_at,
                  author_id: r.actor_slug === 'claude-ai' ? 'claude-ai' : `member_${r.actor_slug}`,
                  author_name: r.actor_slug === 'claude-ai' ? 'Claude AI' : null,
                  author_slug: r.actor_slug,
                })) }
              }
              // updates projection shape (project_id is re-mapped by the handler)
              return { results: rows.map(r => ({
                id: r.id, author: r.actor_slug, content: r.body, update_type: r.update_type, created_at: r.created_at,
              })) }
            }
            if (/FROM activity_entries/.test(sql) && /WHERE (ae\.)?project_id = \?/.test(sql)) {
              const projId = binds[0] as string
              let rows = ae.filter(r => r.project_id === projId)
              rows = applyVisibilityFilter(rows, sql, binds)
              rows = [...rows].sort(byCreatedDesc)
              return { results: rows.map(r => {
                const out = projectRowForSql(sql, r)
                // Mirror the LEFT JOIN tasks → task_title column when selected.
                if (/task_title/.test(sql)) {
                  out.task_title = r.entity_type === 'task' ? (tasks[r.entity_id]?.title ?? null) : null
                }
                return out
              }) }
            }
            // Legacy activity_log read in detail handler — empty.
            if (/FROM activity_log/.test(sql)) return { results: [] }
            if (/FROM task_subtasks/.test(sql)) return { results: [] }
            if (/blocked_by LIKE/.test(sql)) return { results: [] }
            return { results: [] }
          },
          run: async () => {
            if (/INSERT( OR IGNORE)? INTO activity_entries/.test(sql)) {
              const sourceTable = (binds as any[])[11]
              const sourceId = (binds as any[])[12]
              // INSERT OR IGNORE: skip on (source_table, source_id) conflict.
              if (/OR IGNORE/.test(sql) && sourceTable != null) {
                const dup = ae.find(r => r.source_table === sourceTable && r.source_id === sourceId)
                if (dup) return { meta: { changes: 0 } }
              }
              const inserted = insertActivityEntry(binds as any[])
              // RETURNING * insert (used inside the at-source batch): surface the
              // row so batch() can return it per-statement like real D1.
              if (/RETURNING \*/.test(sql)) return { meta: { changes: 1 }, results: [inserted] }
              return { meta: { changes: 1 } }
            }
            // handleSetActivityHidden cascade (v102): hide sets a stamp + hidden_by,
            // unhide NULLs both — both across root (id=?) AND its replies (parent_id=?).
            if (/UPDATE activity_entries SET hidden_at/.test(sql)) {
              const isHide = /hidden_by = \?/.test(sql) // hide binds [caller, id, id]; unhide binds [id, id]
              const rootId = (isHide ? binds[1] : binds[0]) as string
              const stamp = isHide ? '2026-06-10 12:00:00' : null
              const by = isHide ? (binds[0] as string) : null
              let changes = 0
              for (const r of ae) {
                if (r.id === rootId || r.parent_id === rootId) {
                  r.hidden_at = stamp
                  ;(r as Record<string, unknown>).hidden_by = by
                  changes++
                }
              }
              return { meta: { changes } }
            }
            if (/INSERT INTO notifications/.test(sql)) { notifications.push({ binds: [...binds] }); return { meta: {} } }
            if (/INSERT INTO ai_requests/.test(sql)) { aiRequests.push({ binds: [...binds] }); return { meta: {} } }
            // Artifact at-source hook: key_link slot UPDATE — apply to the in-memory task.
            const klm = sql.match(/UPDATE tasks SET key_link_(\d) = \?, key_link_\d_desc = \? WHERE id = \?/)
            if (klm) {
              const slot = klm[1]
              const [url, desc, taskId] = binds as [string, string, string]
              const t = tasks[taskId]
              if (t) {
                ;(t as Record<string, unknown>)[`key_link_${slot}`] = url
                ;(t as Record<string, unknown>)[`key_link_${slot}_desc`] = desc
              }
              return { meta: { changes: t ? 1 : 0 } }
            }
            if (/DELETE FROM activity_entries/.test(sql)) {
              // Task delete cascade: WHERE entity_type='task' AND entity_id=?
              if (/entity_id = \?/.test(sql)) {
                const id = binds[0] as string
                for (let i = ae.length - 1; i >= 0; i--) {
                  if (ae[i].entity_type === 'task' && ae[i].entity_id === id) ae.splice(i, 1)
                }
                return { meta: {} }
              }
              // #98 thread cascade: WHERE parent_id = ? — delete a root's replies.
              // This MUST be matched before the row-targeted fallback below:
              // that fallback reads binds[0] as a ROW id, so an unmatched
              // parent_id delete would silently delete the ROOT instead of its
              // children — the double diverging from real SQL, not the code.
              if (/parent_id = \?/.test(sql)) {
                const parentId = binds[0] as string
                for (let i = ae.length - 1; i >= 0; i--) {
                  if (ae[i].parent_id === parentId) ae.splice(i, 1)
                }
                return { meta: {} }
              }
              // Row-targeted delete (idempotentDelete hard mode): WHERE id = ?
              const rowId = binds[0] as string
              const idx = ae.findIndex(r => r.id === rowId)
              if (idx >= 0) { ae.splice(idx, 1); return { meta: { changes: 1 } } }
              return { meta: { changes: 0 } }
            }
            return { meta: {} }
          },
        }
        stmt.bind = (...args: unknown[]) => { binds = [...binds, ...args]; return stmt }
        return stmt
      },
      batch: async (stmts: any[]) => {
        // Mirror D1: per-statement results. The at-source hook reads
        // results[0].results[0] (the RETURNING * comment row) from this array.
        const out: unknown[] = []
        for (const s of stmts) {
          if (s && typeof s.run === 'function') {
            const r = await s.run()
            out.push({ results: (r && (r as any).results) ?? [], meta: (r as any)?.meta ?? {} })
          } else {
            out.push({ results: [], meta: {} })
          }
        }
        return out
      },
    },
  } as unknown as Env

  // Map a stored AERow to the projected/aliased shape the SQL requested.
  function projectRowForSql(sql: string, r: AERow): Record<string, unknown> {
    // /comments + /updates projection: id, task_id, author_slug, content[, update_type], created_at
    if (/entity_id AS task_id/.test(sql) && /actor_slug AS author_slug/.test(sql) && /body AS content/.test(sql)) {
      const out: Record<string, unknown> = { id: r.id, task_id: r.entity_id, author_slug: r.actor_slug, content: r.body, created_at: r.created_at }
      if (/update_type/.test(sql)) out.update_type = r.update_type
      return out
    }
    // detail handler updates projection: id, content, author_slug, update_type, created_at
    if (/body AS content/.test(sql) && /actor_slug AS author_slug/.test(sql)) {
      return { id: r.id, content: r.body, author_slug: r.actor_slug, update_type: r.update_type, created_at: r.created_at }
    }
    // unified feed / project feed: full row minus source cols
    return {
      id: r.id, entity_type: r.entity_type, entity_id: r.entity_id, project_id: r.project_id,
      kind: r.kind, visibility: r.visibility, actor_slug: r.actor_slug, body: r.body,
      mentions_json: r.mentions_json, update_type: r.update_type, metadata_json: r.metadata_json,
      created_at: r.created_at,
      // #98 threading columns — the real feeds select these, so the double must
      // return them or a threading assertion would pass here and fail in prod.
      parent_id: r.parent_id ?? null,
      ...(/reply_count/.test(sql) ? { reply_count: ae.filter(x => x.parent_id === r.id).length } : {}),
    }
  }

  return { env, ae, notifications, aiRequests }
}

// Auth helpers — PI via test headers, non-PI via test headers, API-key via Bearer.
function piReq(): Request {
  return new Request('https://x/api/test', { method: 'GET', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': PI_EMAIL } })
}
function natePostReq(bodyObj: unknown): Request {
  return new Request('https://x/api/test', { method: 'POST', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': NON_PI_EMAIL, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) })
}
function nateReq(): Request {
  return new Request('https://x/api/test', { method: 'GET', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': NON_PI_EMAIL } })
}
function apiKeyReq(): Request {
  return new Request('https://x/api/test', { method: 'GET', headers: { Authorization: 'Bearer valid-test-api-key' } })
}

const FX: Partial<Fixtures> = {
  tasks: { 't1': { project_id: 'proj_a', title: 'Task One' } },
  projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
  teamSlugs: new Set(['nick-ingraham', 'nate-mesfin']),
}

// ── @me policy + visibility ─────────────────────────────────────────────────────

describe('postActivityEntry — @me policy strips prefix + sets author visibility', () => {
  it("'@me secret' → visibility=author, body stripped to 'secret'", async () => {
    const { env, ae } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: '@me secret note', actorSlug: 'nate-mesfin' })
    expect(r.ok).toBe(true)
    expect(ae[0].visibility).toBe('author')
    expect(ae[0].body).toBe('secret note')
  })

  it('explicit visibility=author works without the prefix', async () => {
    const { env, ae } = makeEnv(FX)
    await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'private', actorSlug: 'nate-mesfin', visibility: 'author' })
    expect(ae[0].visibility).toBe('author')
    expect(ae[0].body).toBe('private')
  })

  it('team body stays team', async () => {
    const { env, ae } = makeEnv(FX)
    await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'hello team', actorSlug: 'nate-mesfin' })
    expect(ae[0].visibility).toBe('team')
  })
})

// ── artifact key_link at-source hook (comment path) ─────────────────────────────
// A comment posted on a TASK whose body carries an artifact portal URL links the
// artifact into a free key_link slot in the SAME batch as the comment insert —
// mirroring the CREATE path (routes/artifacts.ts). Closes the residual the PB
// /process _capture_artifacts band-aid was covering.
describe('postActivityEntry — artifact key_link at source (task comment path)', () => {
  // A fresh fixture per test (the hook mutates task slots).
  function ctxWithArtifact(taskSlots: Partial<Record<'key_link_1' | 'key_link_2' | 'key_link_3', string | null>> = {}) {
    return makeEnv({
      tasks: { t1: { project_id: 'proj_a', title: 'Task One', ...taskSlots } },
      projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
      artifacts: { art_abc123: { title: 'Sepsis lit review' } },
      teamSlugs: new Set(['nick-ingraham', 'nate-mesfin']),
    })
  }
  const URL_ABC = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_abc123'

  it('comment with an artifact URL → links into the first free slot, comment still posts', async () => {
    const { env, ae } = ctxWithArtifact()
    const r = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `Full write-up: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    // Comment landed.
    expect(ae.some(e => e.entity_id === 't1' && e.kind === 'comment')).toBe(true)
    // No linkSkipped flag (a fresh link was written).
    expect((r as { linkSkipped?: string }).linkSkipped).toBeUndefined()
  })

  it('links the artifact title as `Hermes: <title>` description', async () => {
    const { env } = ctxWithArtifact()
    // Capture the UPDATE binds via a wrapper.
    const updates: Array<{ sql: string; binds: unknown[] }> = []
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) {
        const origBind = stmt.bind.bind(stmt)
        stmt.bind = (...args: unknown[]) => { updates.push({ sql, binds: args }); return origBind(...args) }
      }
      return stmt
    }
    await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `here: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(updates).toHaveLength(1)
    expect(updates[0].sql).toMatch(/UPDATE tasks SET key_link_1/)
    expect(updates[0].binds[0]).toBe(URL_ABC)
    expect(updates[0].binds[1]).toBe('Hermes: Sepsis lit review')
    expect(updates[0].binds[2]).toBe('t1')
  })

  it('falls back to a generic desc when the artifact row is not found', async () => {
    const { env } = makeEnv({
      tasks: { t1: { project_id: 'proj_a', title: 'Task One' } },
      projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
      artifacts: {}, // no artifact row for the URL's id
      teamSlugs: new Set(['nick-ingraham']),
    })
    const updates: Array<unknown[]> = []
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) {
        const origBind = stmt.bind.bind(stmt)
        stmt.bind = (...args: unknown[]) => { updates.push(args); return origBind(...args) }
      }
      return stmt
    }
    await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `see ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(updates).toHaveLength(1)
    expect(updates[0][1]).toBe('Hermes: artifact')
  })

  it('idempotent — URL already in a slot → no UPDATE, linkSkipped=already_linked', async () => {
    const { env } = ctxWithArtifact({ key_link_1: URL_ABC })
    const updates: unknown[] = []
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) updates.push(sql)
      return stmt
    }
    const r = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `again: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    expect(updates).toHaveLength(0)
    expect((r as { linkSkipped?: string }).linkSkipped).toBe('already_linked')
  })

  it('all 3 slots full → no link, linkSkipped=slots_full, comment still posts', async () => {
    const { env, ae } = ctxWithArtifact({
      key_link_1: 'https://x/1', key_link_2: 'https://x/2', key_link_3: 'https://x/3',
    })
    const r = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `won't fit: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    expect((r as { linkSkipped?: string }).linkSkipped).toBe('slots_full')
    // Comment still posted.
    expect(ae.some(e => e.entity_id === 't1' && e.kind === 'comment')).toBe(true)
  })

  it('two artifact URLs in one comment fill two distinct slots, left-to-right', async () => {
    const { env } = makeEnv({
      tasks: { t1: { project_id: 'proj_a', title: 'Task One' } },
      projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
      artifacts: { art_abc123: { title: 'First' }, art_def456: { title: 'Second' } },
      teamSlugs: new Set(['nick-ingraham']),
    })
    const url2 = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_def456'
    const updates: Array<{ sql: string; binds: unknown[] }> = []
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) {
        const origBind = stmt.bind.bind(stmt)
        stmt.bind = (...args: unknown[]) => { updates.push({ sql, binds: args }); return origBind(...args) }
      }
      return stmt
    }
    await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `two: ${URL_ABC} and ${url2}`, actorSlug: 'nick-ingraham',
    })
    expect(updates).toHaveLength(2)
    expect(updates[0].sql).toMatch(/key_link_1/)
    expect(updates[0].binds[0]).toBe(URL_ABC)
    expect(updates[1].sql).toMatch(/key_link_2/)
    expect(updates[1].binds[0]).toBe(url2)
  })

  it('partial fit: 1 free slot + 2 URLs → links 1, linkSkipped=slots_full', async () => {
    const { env } = makeEnv({
      tasks: { t1: { project_id: 'proj_a', title: 'Task One', key_link_1: 'https://x/1', key_link_2: 'https://x/2' } },
      projects: { a: { id: 'proj_a', slug: 'alpha', category: 'MNCCORE' } },
      artifacts: { art_abc123: { title: 'First' }, art_def456: { title: 'Second' } },
      teamSlugs: new Set(['nick-ingraham']),
    })
    const url2 = 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_def456'
    const updates: string[] = []
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) updates.push(sql)
      return stmt
    }
    const r = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `${URL_ABC} ${url2}`, actorSlug: 'nick-ingraham',
    })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatch(/key_link_3/)
    expect((r as { linkSkipped?: string }).linkSkipped).toBe('slots_full')
  })

  it('comment on a PROJECT entity → no link attempt', async () => {
    const { env } = ctxWithArtifact()
    const updates: string[] = []
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) updates.push(sql)
      return stmt
    }
    const r = await postActivityEntry({
      env, user: NICK, entityType: 'project', entityId: 'proj_a', kind: 'comment',
      body: `project note with ${URL_ABC}`, actorSlug: 'nick-ingraham', projectSlug: 'alpha',
    })
    expect(r.ok).toBe(true)
    expect(updates).toHaveLength(0)
  })

  it('task UPDATE (kind=update) with an artifact URL → no link attempt (comment-path only)', async () => {
    const { env } = ctxWithArtifact()
    const updates: string[] = []
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) updates.push(sql)
      return stmt
    }
    const r = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', updateType: 'progress',
      body: `progress: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    expect(updates).toHaveLength(0)
  })

  it('comment with a non-artifact URL → ignored, no link attempt', async () => {
    const { env } = ctxWithArtifact()
    const updates: string[] = []
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) updates.push(sql)
      return stmt
    }
    const r = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: 'see https://docs.google.com/document/d/abc for the draft', actorSlug: 'nick-ingraham',
    })
    expect(r.ok).toBe(true)
    expect(updates).toHaveLength(0)
    expect((r as { linkSkipped?: string }).linkSkipped).toBeUndefined()
  })

  it('posting the same artifact-URL comment twice → exactly one key_link', async () => {
    const { env } = ctxWithArtifact()
    let updateCount = 0
    const origPrepare = env.DB.prepare.bind(env.DB)
    ;(env.DB as { prepare: unknown }).prepare = (sql: string) => {
      const stmt = origPrepare(sql)
      if (/UPDATE tasks SET key_link_\d/.test(sql)) updateCount++
      return stmt
    }
    const first = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `first: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    const second = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: `second: ${URL_ABC}`, actorSlug: 'nick-ingraham',
    })
    expect(first.ok && second.ok).toBe(true)
    expect(updateCount).toBe(1) // only the first wrote a slot
    expect((second as { linkSkipped?: string }).linkSkipped).toBe('already_linked')
  })

  // End-to-end through the actual route: linkSkipped surfaces on the response.
  it('route handleAddTaskComment surfaces linkSkipped=slots_full on the response', async () => {
    const { env } = ctxWithArtifact({
      key_link_1: 'https://x/1', key_link_2: 'https://x/2', key_link_3: 'https://x/3',
    })
    const res = await handleAddTaskComment('t1', natePostReq({ content: `won't fit: ${URL_ABC}` }), NATE, env)
    expect(res.status).toBe(201)
    const payload = await res.json() as { data: unknown; linkSkipped?: string }
    expect(payload.linkSkipped).toBe('slots_full')
    expect(payload.data).toBeTruthy() // comment still created
  })

  it('route handleAddTaskComment: clean link → no linkSkipped on the response', async () => {
    const { env } = ctxWithArtifact()
    const res = await handleAddTaskComment('t1', natePostReq({ content: `here: ${URL_ABC}` }), NATE, env)
    expect(res.status).toBe(201)
    const payload = await res.json() as { linkSkipped?: string }
    expect(payload.linkSkipped).toBeUndefined()
  })
})

describe('read visibility gate — author-only rows hidden from other actors', () => {
  async function seed() {
    const ctx = makeEnv(FX)
    // Nate's author-only note + a team comment.
    await postActivityEntry({ env: ctx.env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: '@me natesecret', actorSlug: 'nate-mesfin' })
    await postActivityEntry({ env: ctx.env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'shared', actorSlug: 'nate-mesfin' })
    return ctx
  }

  it('author (Nate) sees own author-only row', async () => {
    const ctx = await seed()
    const res = await handleGetTaskComments('t1', nateReq(), ctx.env)
    const body = await res.json() as { data: { content: string }[] }
    expect(body.data.map(d => d.content).sort()).toEqual(['natesecret', 'shared'])
  })

  it('a different non-PI actor does NOT see the author-only row', async () => {
    const ctx = await seed()
    // Use a non-PI request whose actor differs from the author. nick is PI, so
    // make a fresh non-PI user identity that is NOT nate-mesfin.
    const otherReq = new Request('https://x/api/test', { method: 'GET', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': 'collins@umn.edu' } })
    const res = await handleGetTaskComments('t1', otherReq, ctx.env)
    const body = await res.json() as { data: { content: string }[] }
    expect(body.data.map(d => d.content)).toEqual(['shared'])
  })

  it('API-key caller sees ALL rows including author-only', async () => {
    const ctx = await seed()
    const res = await handleGetTaskComments('t1', apiKeyReq(), ctx.env)
    const body = await res.json() as { data: { content: string }[] }
    expect(body.data.map(d => d.content).sort()).toEqual(['natesecret', 'shared'])
  })

  it('PI (Nick) sees ALL rows including others author-only', async () => {
    const ctx = await seed()
    const res = await handleGetTaskComments('t1', piReq(), ctx.env)
    const body = await res.json() as { data: { content: string }[] }
    expect(body.data.map(d => d.content).sort()).toEqual(['natesecret', 'shared'])
  })
})

// ── validation ──────────────────────────────────────────────────────────────────

describe('owner re-notification — activity on YOUR task re-lights the bell (2026-06-11)', () => {
  const OWNED = { tasks: { t1: { project_id: 'proj_a', title: 'Task One', assignee: 'nick-ingraham' } }, projects: FX.projects, teamSlugs: FX.teamSlugs } as Partial<Fixtures>

  it('team comment by another actor notifies the assignee with a portal deep-link', async () => {
    const { env, notifications } = makeEnv(OWNED)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'made progress on this', actorSlug: 'nate-mesfin' })
    expect(r.ok).toBe(true)
    const owner = notifications.find(n => (n.binds as unknown[])[1] === 'nick-ingraham')
    expect(owner).toBeTruthy()
    const binds = owner!.binds as unknown[]
    expect(binds[2]).toBe('update')                          // type
    expect(binds[7]).toBe('/portal/my-tasks?open=t1')        // direct editor deep-link
  })

  it('author-only (@me) entries notify NO ONE', async () => {
    const { env, notifications } = makeEnv(OWNED)
    await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: '@me private thought', actorSlug: 'nate-mesfin' })
    expect(notifications.length).toBe(0)
  })

  it('self-activity (actor == assignee) does not notify', async () => {
    const { env, notifications } = makeEnv(OWNED)
    await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment', body: 'note to self, team-visible', actorSlug: 'nick-ingraham' })
    expect(notifications.length).toBe(0)
  })

  it('assignee already @mentioned gets ONLY the richer mention notification (no dup)', async () => {
    const { env, notifications } = makeEnv(OWNED)
    await postActivityEntry({ env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment', body: 'hey @nick-ingraham look at this', actorSlug: 'nate-mesfin' })
    const toNick = notifications.filter(n => (n.binds as unknown[])[1] === 'nick-ingraham')
    expect(toNick.length).toBe(1)
    expect((toNick[0].binds as unknown[])[2]).toBe('mention')
  })
})

describe('postActivityEntry — validation', () => {
  it('rejects an unknown kind', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'bogus' as any, body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects an unknown update_type for kind=update', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', updateType: 'nope', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
  })

  it('defaults update_type to progress for kind=update', async () => {
    const { env, ae } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(true)
    expect(ae[0].update_type).toBe('progress')
  })

  it('rejects update_type on a non-update kind', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment', updateType: 'progress', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown entity_type', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'widget' as any, entityId: 'w1', kind: 'comment', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
  })

  it('404s when the task entity does not exist', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 'ghost', kind: 'comment', body: 'x', actorSlug: 'nick-ingraham' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(404)
  })
})

// ── idempotency ──────────────────────────────────────────────────────────────────

describe('postActivityEntry — source_table/source_id idempotency', () => {
  it('a second insert with the same source returns the existing row, no dup', async () => {
    const { env, ae } = makeEnv(FX)
    const first = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', body: 'migrated', actorSlug: 'nick-ingraham', sourceTable: 'task_updates', sourceId: 'tu-1' })
    expect(first.ok).toBe(true)
    const before = ae.length
    const second = await postActivityEntry({ env, user: NICK, entityType: 'task', entityId: 't1', kind: 'update', body: 'migrated', actorSlug: 'nick-ingraham', sourceTable: 'task_updates', sourceId: 'tu-1' })
    expect(second.ok).toBe(true)
    expect(ae.length).toBe(before) // no duplicate row
    if (first.ok && second.ok) expect(second.row.id).toBe(first.row.id)
  })
})

// ── projection shapes ────────────────────────────────────────────────────────────

describe('projection shapes match the legacy endpoints', () => {
  it('GET /comments returns id, task_id, author_slug, content, created_at', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: 'a comment' }), NATE, ctx.env)
    const res = await handleGetTaskComments('t1', piReq(), ctx.env)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(Object.keys(body.data[0]).sort()).toEqual(['author_slug', 'content', 'created_at', 'id', 'task_id'])
    expect(body.data[0].content).toBe('a comment')
    expect(body.data[0].author_slug).toBe('nate-mesfin')
    expect(body.data[0].task_id).toBe('t1')
  })

  it('GET /updates returns id, task_id, author_slug, content, update_type, created_at', async () => {
    const ctx = makeEnv(FX)
    await handlePostTaskUpdate('t1', natePostReq({ content: 'progress note', update_type: 'blocker' }), NATE, ctx.env)
    const res = await handleGetTaskUpdates('t1', piReq(), ctx.env)
    const body = await res.json() as { data: Record<string, unknown>[] }
    expect(Object.keys(body.data[0]).sort()).toEqual(['author_slug', 'content', 'created_at', 'id', 'task_id', 'update_type'])
    expect(body.data[0].update_type).toBe('blocker')
  })
})

// ── unified feed + project feed ───────────────────────────────────────────────────

describe('handleGetTaskActivity — unified feed', () => {
  it('returns comments + updates together, newest-first', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: 'first' }), NATE, ctx.env)
    await handlePostTaskUpdate('t1', natePostReq({ content: 'second', update_type: 'progress' }), NATE, ctx.env)
    const res = await handleGetTaskActivity('t1', piReq(), ctx.env)
    const body = await res.json() as { data: { kind: string; body: string }[] }
    expect(body.data.length).toBe(2)
    // newest-first: 'second' (update) before 'first' (comment)
    expect(body.data[0].body).toBe('second')
    expect(body.data.map(d => d.kind).sort()).toEqual(['comment', 'update'])
  })
})

describe('handleGetProjectActivity — whole-picture feed', () => {
  it('includes task rows rolled up by project_id', async () => {
    const ctx = makeEnv(FX)
    // A task comment on t1 (project proj_a) + a direct project entry.
    await handleAddTaskComment('t1', natePostReq({ content: 'task-level' }), NATE, ctx.env)
    await postActivityEntry({ env: ctx.env, user: NICK, entityType: 'project', entityId: 'proj_a', kind: 'update', body: 'project-level', actorSlug: 'nick-ingraham' })
    const res = await handleGetProjectActivity('alpha', piReq(), ctx.env)
    const body = await res.json() as { data: { entity_type: string; body: string; task_title?: string | null }[] }
    const bodies = body.data.map(d => d.body).sort()
    expect(bodies).toEqual(['project-level', 'task-level'])
    expect(body.data.some(d => d.entity_type === 'task')).toBe(true)
    expect(body.data.some(d => d.entity_type === 'project')).toBe(true)
    // task rows carry the joined display title; project rows don't.
    expect(body.data.find(d => d.entity_type === 'task')?.task_title).toBe('Task One')
    expect(body.data.find(d => d.entity_type === 'project')?.task_title ?? null).toBeNull()
  })
})

// ── P2-A: project composer retarget + legacy-shape projections ───────────────────

describe('P2-A — project composers write activity_entries; old reads are projections', () => {
  it('handleAddComment lands in activity_entries and round-trips through handleGetComments', async () => {
    const ctx = makeEnv(FX)
    const res = await handleAddComment('alpha', natePostReq({ content: 'hello project' }), NATE, ctx.env)
    expect(res.status).toBe(201)
    const row = ctx.ae.find(r => r.entity_type === 'project' && r.kind === 'comment')
    expect(row).toBeDefined()
    expect(row!.entity_id).toBe('proj_a')
    expect(row!.actor_slug).toBe('nate-mesfin')

    const read = await handleGetComments('alpha', piReq(), ctx.env)
    const body = await read.json() as { data: Record<string, unknown>[] }
    expect(Object.keys(body.data[0]).sort()).toEqual(['author_id', 'author_name', 'author_slug', 'content', 'created_at', 'id'])
    expect(body.data[0].content).toBe('hello project')
    expect(body.data[0].author_slug).toBe('nate-mesfin')
  })

  it('handlePostProjectUpdate lands in activity_entries; response + projection keep the legacy slug-keyed shape', async () => {
    const ctx = makeEnv(FX)
    const res = await handlePostProjectUpdate('alpha', natePostReq({ content: 'a note', update_type: 'blocker' }), NATE, ctx.env)
    expect(res.status).toBe(201)
    const created = await res.json() as { data: Record<string, unknown> }
    expect(created.data.project_id).toBe('alpha') // slug echo, not the typed id
    expect(created.data.author).toBe('nate-mesfin')
    expect(created.data.update_type).toBe('blocker')

    const row = ctx.ae.find(r => r.entity_type === 'project' && r.kind === 'update')
    expect(row).toBeDefined()
    expect(row!.entity_id).toBe('proj_a') // stored against the canonical typed id

    const read = await handleGetProjectUpdates('alpha', piReq(), ctx.env)
    const body = await read.json() as { data: Record<string, unknown>[] }
    expect(Object.keys(body.data[0]).sort()).toEqual(['author', 'content', 'created_at', 'id', 'project_id', 'update_type'])
    expect(body.data[0].project_id).toBe('alpha')
    expect(body.data[0].update_type).toBe('blocker')
  })

  it('project comment + update roll into the whole-picture project feed', async () => {
    const ctx = makeEnv(FX)
    await handleAddComment('alpha', natePostReq({ content: 'c1' }), NATE, ctx.env)
    await handlePostProjectUpdate('alpha', natePostReq({ content: 'u1' }), NATE, ctx.env)
    const res = await handleGetProjectActivity('alpha', piReq(), ctx.env)
    const body = await res.json() as { data: { kind: string }[] }
    expect(body.data.map(d => d.kind).sort()).toEqual(['comment', 'update'])
  })

  // PB session-close capture (2026-06-23): the route forwards source_table /
  // source_id from the request body to postActivityEntry, so a re-post with the
  // SAME key (session-close + overnight Inbox flush) is INSERT-OR-IGNORE'd.
  it('handlePostProjectUpdate forwards source_table/source_id; a second post with the same key is deduped to ONE row', async () => {
    const ctx = makeEnv(FX)
    const post = () => handlePostProjectUpdate(
      'alpha',
      natePostReq({
        content: 'progress: shipped the capture pass',
        source_table: 'pb_progress_note',
        source_id: 'abc123def456abc123def456abc12300',
      }),
      NATE,
      ctx.env,
    )

    const first = await post()
    expect(first.status).toBe(201)
    const firstRow = ctx.ae.find(r => r.entity_type === 'project' && r.source_table === 'pb_progress_note')
    expect(firstRow).toBeDefined()
    expect(firstRow!.source_table).toBe('pb_progress_note')
    expect(firstRow!.source_id).toBe('abc123def456abc123def456abc12300')
    const after1 = ctx.ae.length

    // Second identical post — INSERT OR IGNORE drops it; no new row.
    const second = await post()
    expect(second.status).toBe(201) // route still returns the canonical (pre-existing) row
    expect(ctx.ae.length).toBe(after1) // NO duplicate
    expect(ctx.ae.filter(r => r.source_table === 'pb_progress_note').length).toBe(1)
  })

  // Half-set source params must NOT store a non-NULL source_table with a NULL
  // source_id (outside the partial UNIQUE index's intent). The route requires
  // the pair or neither.
  it('handlePostProjectUpdate ignores a half-set source key (source_table without source_id)', async () => {
    const ctx = makeEnv(FX)
    const res = await handlePostProjectUpdate(
      'alpha',
      natePostReq({ content: 'no key', source_table: 'pb_progress_note' }),
      NATE,
      ctx.env,
    )
    expect(res.status).toBe(201)
    const row = ctx.ae.find(r => r.entity_type === 'project' && r.kind === 'update')
    expect(row).toBeDefined()
    expect(row!.source_table).toBeNull()
    expect(row!.source_id).toBeNull()
  })

  // #103: the TASK lane needs the same idempotency contract the project lane
  // has had since 2026-06-23. Without it PB could only write per-PROJECT
  // session summaries — session-close and the overnight Inbox backstop both
  // emit the note, so a task note would have duplicated on every close.
  it('handlePostTaskUpdate forwards source_table/source_id; a second post with the same key is deduped to ONE row', async () => {
    const ctx = makeEnv(FX)
    const post = () => handlePostTaskUpdate(
      't1',
      natePostReq({
        content: 'progress: wired the day-scoped transcript',
        source_table: 'pb_progress_note',
        source_id: 'feedfacefeedfacefeedfacefeedfa00',
      }),
      NATE,
      ctx.env,
    )

    const first = await post()
    expect(first.status).toBe(201)
    const firstRow = ctx.ae.find(r => r.entity_type === 'task' && r.source_table === 'pb_progress_note')
    expect(firstRow).toBeDefined()
    expect(firstRow!.source_id).toBe('feedfacefeedfacefeedfacefeedfa00')
    const after1 = ctx.ae.length

    const second = await post()
    expect(second.status).toBe(201)
    expect(ctx.ae.length).toBe(after1)
    expect(ctx.ae.filter(r => r.source_table === 'pb_progress_note').length).toBe(1)
  })

  it('handlePostTaskUpdate ignores a half-set source key (source_table without source_id)', async () => {
    const ctx = makeEnv(FX)
    const res = await handlePostTaskUpdate(
      't1',
      natePostReq({ content: 'no key', source_table: 'pb_progress_note' }),
      NATE,
      ctx.env,
    )
    expect(res.status).toBe(201)
    const row = ctx.ae.find(r => r.entity_type === 'task' && r.kind === 'update')
    expect(row).toBeDefined()
    expect(row!.source_table).toBeNull()
    expect(row!.source_id).toBeNull()
  })

  // A project note and a task note with the SAME body on the same day are
  // DIFFERENT rows — Nick wants the task summary even when it duplicates the
  // project one. The two lanes must therefore key into different namespaces
  // (PB prefixes the task key), or one would silently swallow the other.
  it('a task note and a project note with distinct keys both land', async () => {
    const ctx = makeEnv(FX)
    const shared = 'Shipped the transcript fix.'
    await handlePostProjectUpdate('alpha', natePostReq({
      content: shared, source_table: 'pb_progress_note', source_id: 'a'.repeat(32),
    }), NATE, ctx.env)
    await handlePostTaskUpdate('t1', natePostReq({
      content: shared, source_table: 'pb_progress_note', source_id: 'b'.repeat(32),
    }), NATE, ctx.env)
    const notes = ctx.ae.filter(r => r.source_table === 'pb_progress_note')
    expect(notes.map(r => r.entity_type).sort()).toEqual(['project', 'task'])
  })
})

// ── Hermes placeholder ────────────────────────────────────────────────────────────

describe('Hermes — @hermes lands a placeholder activity entry + ai_request', () => {
  it('creates a claude-ai comment placeholder and an ai_request', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: '@hermes please summarize the task context' }), NATE, ctx.env)
    const placeholder = ctx.ae.find(r => r.actor_slug === 'claude-ai' && r.body.includes('Thinking about'))
    expect(placeholder).toBeDefined()
    expect(placeholder!.kind).toBe('comment')
    expect(ctx.aiRequests.length).toBe(1)
    // ai_requests bind index 1 = source_type
    expect((ctx.aiRequests[0].binds as unknown[])[1]).toBe('task_comment')
  })

  it('a Hermes placeholder for an @me question inherits author visibility', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: '@me @hermes is this private analysis right' }), NATE, ctx.env)
    const placeholder = ctx.ae.find(r => r.actor_slug === 'claude-ai')
    expect(placeholder).toBeDefined()
    expect(placeholder!.visibility).toBe('author')
  })

  // Phase 5 (the typed-prefix writer flip): SmartCompose + TaskDetailPanel post
  // the body verbatim (@hermes token intact) with an explicit visibility:'author'
  // field — NOT the @me prefix. The ask AND Hermes's answer must both stay
  // author-only; a revert to team here republishes every private typed ask.
  it("Phase 5: explicit visibility='author' + @hermes body keeps the ask AND the placeholder private", async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: '@hermes draft a reply to the reviewer', visibility: 'author' }), NATE, ctx.env)
    const root = ctx.ae.find(r => r.actor_slug === 'nate-mesfin')
    expect(root).toBeDefined()
    expect(root!.visibility).toBe('author')
    expect(root!.body).toBe('@hermes draft a reply to the reviewer') // token kept → Hermes fires
    const placeholder = ctx.ae.find(r => r.actor_slug === 'claude-ai')
    expect(placeholder).toBeDefined()
    expect(placeholder!.visibility).toBe('author')
    expect(ctx.aiRequests.length).toBe(1) // dispatched as a task_comment
  })

  // A short but real question used to be silently dropped by a `<= 5` guard; the
  // composer still said "Asked Hermes". Now it dispatches and reports it.
  it('a short @hermes question dispatches and reports dispatched:true', async () => {
    const ctx = makeEnv(FX)
    const res = await handleAddTaskComment('t1', natePostReq({ content: '@hermes fix?' }), NATE, ctx.env)
    expect(ctx.aiRequests.length).toBe(1)
    const out = await res.json() as { hermes?: { dispatched: boolean } }
    expect(out.hermes?.dispatched).toBe(true)
  })

  // A bare @hermes with no question must NOT read as success — no dispatch, and
  // the outcome is reported so the composer can say "add a question".
  it('a bare @hermes does not dispatch and reports reason:empty', async () => {
    const ctx = makeEnv(FX)
    const res = await handleAddTaskComment('t1', natePostReq({ content: '@hermes' }), NATE, ctx.env)
    expect(ctx.aiRequests.length).toBe(0)
    const out = await res.json() as { hermes?: { dispatched: boolean; reason?: string } }
    expect(out.hermes).toEqual({ dispatched: false, reason: 'empty' })
  })
})

// ── delete cascade ────────────────────────────────────────────────────────────────

describe('task delete cascades activity_entries', () => {
  it('removes the task entries on hard cascade-clean', async () => {
    const ctx = makeEnv(FX)
    await handleAddTaskComment('t1', natePostReq({ content: 'to be deleted' }), NATE, ctx.env)
    expect(ctx.ae.filter(r => r.entity_id === 't1').length).toBeGreaterThan(0)
    // handleDeleteTask runs the cascade DELETE FROM activity_entries.
    const delReq = new Request('https://x/api/test', { method: 'POST', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': PI_EMAIL } })
    await handleDeleteTask('t1', delReq, NICK, ctx.env)
    expect(ctx.ae.filter(r => r.entity_type === 'task' && r.entity_id === 't1').length).toBe(0)
  })
})

// ── Manual activity deletion (author or PI) — POST /api/activity/:id/delete ──

describe('handleDeleteActivityEntry — author-or-PI manual delete', () => {
  async function seed(env: Env, actorSlug: string): Promise<string> {
    const user = actorSlug === 'nick-ingraham' ? NICK : NATE
    const r = await postActivityEntry({ env, user, entityType: 'task', entityId: 't1', kind: 'comment', body: 'to be deleted', actorSlug })
    if (!r.ok) throw new Error('seed failed')
    return r.row.id
  }

  it('author deletes their own entry (hard delete)', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleDeleteActivityEntry(id, nateReq(), NATE, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { deleted: boolean; idempotent: boolean } }
    expect(body.data.deleted).toBe(true)
    expect(body.data.idempotent).toBe(false)
    expect(ae.find(r => r.id === id)).toBeUndefined()
  })

  it("non-PI cannot delete someone else's entry (403, row intact)", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nick-ingraham')
    const res = await handleDeleteActivityEntry(id, nateReq(), NATE, env)
    expect(res.status).toBe(403)
    expect(ae.find(r => r.id === id)).toBeDefined()
  })

  it("PI deletes anyone's entry", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleDeleteActivityEntry(id, piReq(), NICK, env)
    expect(res.status).toBe(200)
    expect(ae.find(r => r.id === id)).toBeUndefined()
  })

  it('missing row is idempotent (200, idempotent:true)', async () => {
    const { env } = makeEnv(FX)
    const res = await handleDeleteActivityEntry('ae_missing', piReq(), NICK, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { idempotent: boolean } }
    expect(body.data.idempotent).toBe(true)
  })
})

describe('handleEditActivityEntry — author-or-PI edit', () => {
  async function seed(env: Env, actorSlug: string, kind: 'comment' | 'update' = 'comment'): Promise<string> {
    const user = actorSlug === 'nick-ingraham' ? NICK : NATE
    const r = await postActivityEntry({
      env, user, entityType: 'task', entityId: 't1', kind, body: 'original body', actorSlug,
      ...(kind === 'update' ? { updateType: 'progress' } : {}),
    })
    if (!r.ok) throw new Error('seed failed')
    return r.row.id as string
  }
  function editReq(email: string, body: unknown): Request {
    return new Request('https://x/api/test', {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': email, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('author edits their own comment (body updated + edited flag)', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleEditActivityEntry(id, editReq(NON_PI_EMAIL, { body: 'revised body' }), NATE, env)
    expect(res.status).toBe(200)
    const row = ae.find(r => r.id === id)!
    expect(row.body).toBe('revised body')
    expect(JSON.parse(row.metadata_json!).edited).toBe(true)
  })

  it("non-PI cannot edit someone else's comment (403, body intact)", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nick-ingraham')
    const res = await handleEditActivityEntry(id, editReq(NON_PI_EMAIL, { body: 'hijack' }), NATE, env)
    expect(res.status).toBe(403)
    expect(ae.find(r => r.id === id)!.body).toBe('original body')
  })

  it("PI edits anyone's comment", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleEditActivityEntry(id, editReq(PI_EMAIL, { body: 'pi fix' }), NICK, env)
    expect(res.status).toBe(200)
    expect(ae.find(r => r.id === id)!.body).toBe('pi fix')
  })

  it('empty body is rejected (400)', async () => {
    const { env } = makeEnv(FX)
    const id = await seed(env, 'nate-mesfin')
    const res = await handleEditActivityEntry(id, editReq(NON_PI_EMAIL, { body: '   ' }), NATE, env)
    expect(res.status).toBe(400)
  })

  it('missing row is 404', async () => {
    const { env } = makeEnv(FX)
    const res = await handleEditActivityEntry('ae_missing', editReq(PI_EMAIL, { body: 'x' }), NICK, env)
    expect(res.status).toBe(404)
  })
})

// ── hide / dismiss (v102, Hermes wave Phase 2) ──────────────────────────────────
// "Dismiss" hides a thread from feeds but RETAINS the rows. The subtle correctness
// bit is INHERITANCE: a reply posted AFTER a root is dismissed must be born hidden,
// or it leaks the thread back into the feed (§2.2). Exercised end-to-end through the
// real endpoint + the real write primitive, not a stub.
describe('handleSetActivityHidden — dismiss/restore a thread root (v102)', () => {
  function hideReq(email: string, body: unknown): Request {
    return new Request('https://x/api/test', {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': email, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  async function seedRoot(env: Env, actorSlug = 'nate-mesfin'): Promise<string> {
    const user = actorSlug === 'nick-ingraham' ? NICK : NATE
    const r = await postActivityEntry({ env, user, entityType: 'task', entityId: 't1', kind: 'comment', body: 'root', actorSlug })
    if (!r.ok) throw new Error('seed failed')
    return r.row.id as string
  }
  async function reply(env: Env, parentId: string, actorSlug = 'nate-mesfin') {
    const user = actorSlug === 'nick-ingraham' ? NICK : NATE
    return postActivityEntry({ env, user, entityType: 'task', entityId: '', parentId, kind: 'comment', body: 'child', actorSlug })
  }

  it('author dismisses own root → 200 and hidden_at is set', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env)
    const res = await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    expect(res.status).toBe(200)
    expect(ae.find(r => r.id === id)!.hidden_at).toBeTruthy()
  })

  it('a reply posted AFTER the dismiss is born hidden (inheritance — no leak)', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env)
    await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    const r = await reply(env, id)
    expect(r.ok).toBe(true)
    expect((r as { ok: true; row: Record<string, unknown> }).row.hidden_at).toBeTruthy()
    expect(ae.find(x => x.parent_id === id)!.hidden_at).toBeTruthy()
  })

  it('dismiss cascades to a reply that already existed', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env)
    await reply(env, id)
    await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    expect(ae.filter(r => r.id === id || r.parent_id === id).every(r => r.hidden_at)).toBe(true)
  })

  it('unhide clears hidden_at on root + replies', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env)
    await reply(env, id)
    await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: false }), NATE, env)
    expect(ae.filter(r => r.id === id || r.parent_id === id).every(r => r.hidden_at == null)).toBe(true)
  })

  it('hiding a REPLY is a 400 (only roots dismissible)', async () => {
    const { env } = makeEnv(FX)
    const id = await seedRoot(env)
    const r = await reply(env, id)
    const replyId = (r as { ok: true; row: Record<string, unknown> }).row.id as string
    const res = await handleSetActivityHidden(replyId, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    expect(res.status).toBe(400)
  })

  it("non-PI cannot dismiss someone else's root (403, stays visible)", async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env, 'nick-ingraham')
    const res = await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: true }), NATE, env)
    expect(res.status).toBe(403)
    expect(ae.find(r => r.id === id)!.hidden_at ?? null).toBeNull()
  })

  it('PI dismisses anyone\'s root', async () => {
    const { env, ae } = makeEnv(FX)
    const id = await seedRoot(env, 'nate-mesfin')
    const res = await handleSetActivityHidden(id, hideReq(PI_EMAIL, { hidden: true }), NICK, env)
    expect(res.status).toBe(200)
    expect(ae.find(r => r.id === id)!.hidden_at).toBeTruthy()
  })

  it('non-boolean hidden is rejected (400)', async () => {
    const { env } = makeEnv(FX)
    const id = await seedRoot(env)
    const res = await handleSetActivityHidden(id, hideReq(NON_PI_EMAIL, { hidden: 'yes' }), NATE, env)
    expect(res.status).toBe(400)
  })

  it('missing row is 404', async () => {
    const { env } = makeEnv(FX)
    const res = await handleSetActivityHidden('ae_missing', hideReq(PI_EMAIL, { hidden: true }), NICK, env)
    expect(res.status).toBe(404)
  })
})

// ── the `day` entity (Hermes wave Phase 3) ──────────────────────────────────────
// A day is a civil-date bucket with NO table: the shape check IS the existence
// check, project_id is always NULL, and a @hermes ask reuses the listener-safe
// 'daily_thought' source_type with context=NULL. Day threads default PRIVATE.
function dayPostReq(email: string, body: unknown): Request {
  return new Request('https://x/api/test', {
    method: 'POST',
    headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': email, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function userGetReq(email: string): Request {
  return new Request('https://x/api/test', { method: 'GET', headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': email } })
}

describe('postActivityEntry — day entity', () => {
  it('accepts a valid civil date, project_id is NULL', async () => {
    const { env, ae } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'day', entityId: '2026-07-22', kind: 'comment', body: 'a private thought', actorSlug: 'nate-mesfin', visibility: 'author' })
    expect(r.ok).toBe(true)
    expect(ae[0].entity_type).toBe('day')
    expect(ae[0].project_id).toBeNull()
  })

  it('rejects a non-date entity_id (400) — no entity namespace by invention', async () => {
    const { env } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'day', entityId: 'whatever', kind: 'comment', body: 'x', actorSlug: 'nate-mesfin' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('@hermes on a day dispatches source_type=daily_thought with context=NULL (listener-safe)', async () => {
    const { env, aiRequests } = makeEnv(FX)
    const r = await postActivityEntry({ env, user: NATE, entityType: 'day', entityId: '2026-07-22', kind: 'comment', body: '@hermes what should I focus on today', actorSlug: 'nate-mesfin', visibility: 'author' })
    expect(r.ok).toBe(true)
    expect(aiRequests.length).toBe(1)
    const binds = aiRequests[0].binds as unknown[]
    expect(binds[1]).toBe('daily_thought') // source_type
    expect(binds[5]).toBeNull()             // context — NEVER "day: <date>"
  })
})

// ── #98 multi-turn: the thread transcript Hermes gets in its prompt ───────────
//
// Nick's ask: "if I wanted it to do something different with the email, it would
// have the context of what it did in the prior post." The transcript therefore
// has to include HERMES'S OWN prior answers, not just the user's questions.
// Since @hermes threads went private-by-default, those answers are
// visibility='author' with actor_slug='claude-ai' — neither team-visible nor
// the requester's — so a two-arm gate dropped every one of them and Hermes
// answered each follow-up with no memory of what it had just written.
describe('dispatchHermes — thread transcript (#98)', () => {
  /** Prompt of the Nth ai_requests insert (bind index 4). */
  const promptOf = (aiRequests: Array<Record<string, unknown>>, n: number) =>
    (aiRequests[n].binds as unknown[])[4] as string

  async function privateThreadWithAnswer(env: Env, ae: AERow[]) {
    const root = await postActivityEntry({
      env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment',
      body: '@hermes draft an email to Will about the cohort', actorSlug: 'nate-mesfin', visibility: 'author',
    })
    if (!root.ok) throw new Error('root failed')
    const rootId = root.row.id as string
    // Stand in for the listener's answer: claude-ai reply, private by inheritance.
    const answer = await postActivityEntry({
      env, user: { email: 'claude-ai', name: 'Hermes' }, entityType: 'task', entityId: 't1',
      kind: 'comment', body: 'Draft: Hi Will, the cohort is 4,812 encounters.',
      actorSlug: 'claude-ai', visibility: 'author', parentId: rootId, fireSideEffects: false,
    })
    if (!answer.ok) throw new Error('answer failed')
    // Drop the "Thinking…" placeholder the root's dispatch left behind so the
    // assertions below read a clean two-message thread.
    for (let i = ae.length - 1; i >= 0; i--) {
      if (ae[i].body.startsWith('Thinking about this')) ae.splice(i, 1)
    }
    return rootId
  }

  it("carries Hermes's own prior answer into the follow-up prompt", async () => {
    const { env, ae, aiRequests } = makeEnv(FX)
    const rootId = await privateThreadWithAnswer(env, ae)
    await postActivityEntry({
      env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment',
      body: '@hermes make it shorter', actorSlug: 'nate-mesfin', visibility: 'author', parentId: rootId,
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).toContain('<activity_thread_context')
    expect(prompt).toContain('4,812')                    // what Hermes said last time
    expect(prompt).toContain('draft an email to Will')   // the original question
    expect(prompt).toContain('<current_request>')
    expect(prompt).not.toContain('Thinking about this')  // placeholders carry no content
  })

  it('labels the assistant turns so the model can tell who said what', async () => {
    const { env, ae, aiRequests } = makeEnv(FX)
    const rootId = await privateThreadWithAnswer(env, ae)
    await postActivityEntry({
      env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment',
      body: '@hermes shorter', actorSlug: 'nate-mesfin', visibility: 'author', parentId: rootId,
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).toContain('assistant hermes')
    expect(prompt).toContain('user nate-mesfin')
  })

  // LEAK CLASS. The root arm must admit a private child only when the child's
  // OWN root is author-private AND authored by the requester. A private reply
  // under someone else's TEAM root fails all three arms and must stay invisible.
  it("does NOT leak another member's private reply under a shared team root", async () => {
    const { env, aiRequests } = makeEnv(FX)
    const root = await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: 'team-visible kickoff', actorSlug: 'nick-ingraham',
    })
    if (!root.ok) throw new Error('root failed')
    const rootId = root.row.id as string
    await postActivityEntry({
      env, user: NICK, entityType: 'task', entityId: 't1', kind: 'comment',
      body: 'SECRET salary figure', actorSlug: 'nick-ingraham', visibility: 'author', parentId: rootId,
    })
    await postActivityEntry({
      env, user: NATE, entityType: 'task', entityId: 't1', kind: 'comment',
      body: '@hermes summarise this thread', actorSlug: 'nate-mesfin', parentId: rootId,
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).toContain('team-visible kickoff')
    expect(prompt).not.toContain('SECRET salary figure')
  })

  it("does NOT leak another member's private day thread into a day-scoped transcript", async () => {
    const { env, aiRequests } = makeEnv(FX)
    await postActivityEntry({
      env, user: NICK, entityType: 'day', entityId: '2026-07-24', kind: 'comment',
      body: 'SECRET morning thought', actorSlug: 'nick-ingraham', visibility: 'author',
    })
    await postActivityEntry({
      env, user: NATE, entityType: 'day', entityId: '2026-07-24', kind: 'comment',
      body: '@hermes what did we talk about today', actorSlug: 'nate-mesfin', visibility: 'author',
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).not.toContain('SECRET morning thought')
  })

  it("day scope DOES recall the requester's own earlier private exchange", async () => {
    const { env, ae, aiRequests } = makeEnv(FX)
    const first = await postActivityEntry({
      env, user: NATE, entityType: 'day', entityId: '2026-07-24', kind: 'comment',
      body: '@hermes remind me to email Will', actorSlug: 'nate-mesfin', visibility: 'author',
    })
    if (!first.ok) throw new Error('first failed')
    await postActivityEntry({
      env, user: { email: 'claude-ai', name: 'Hermes' }, entityType: 'day', entityId: '2026-07-24',
      kind: 'comment', body: 'Noted — email Will about the cohort.', actorSlug: 'claude-ai',
      visibility: 'author', parentId: first.row.id as string, fireSideEffects: false,
    })
    for (let i = ae.length - 1; i >= 0; i--) {
      if (ae[i].body.startsWith('Thinking about this')) ae.splice(i, 1)
    }
    await postActivityEntry({
      env, user: NATE, entityType: 'day', entityId: '2026-07-24', kind: 'comment',
      body: '@hermes what was that again', actorSlug: 'nate-mesfin', visibility: 'author',
    })
    const prompt = promptOf(aiRequests, aiRequests.length - 1)
    expect(prompt).toContain('email Will about the cohort')
  })
})

describe('handlePostDayActivity — private by default', () => {
  it('a day post defaults to visibility=author (preserves pre-wave privacy)', async () => {
    const { env, ae } = makeEnv(FX)
    const res = await handlePostDayActivity('2026-07-22', dayPostReq(NON_PI_EMAIL, { content: 'plan the morning' }), NATE, env)
    expect(res.status).toBe(201)
    expect(ae[0].visibility).toBe('author')
  })

  it('an explicit share opts into team visibility', async () => {
    const { env, ae } = makeEnv(FX)
    await handlePostDayActivity('2026-07-22', dayPostReq(NON_PI_EMAIL, { content: 'team FYI', visibility: 'team' }), NATE, env)
    expect(ae[0].visibility).toBe('team')
  })

  it('rejects a malformed date (400)', async () => {
    const { env } = makeEnv(FX)
    const res = await handlePostDayActivity('2026-7-2', dayPostReq(NON_PI_EMAIL, { content: 'x' }), NATE, env)
    expect(res.status).toBe(400)
  })
})

describe('handleGetDayActivity — private day feed', () => {
  it('rejects a malformed date (400)', async () => {
    const { env } = makeEnv(FX)
    const res = await handleGetDayActivity('not-a-date', userGetReq(NON_PI_EMAIL), env)
    expect(res.status).toBe(400)
  })

  it("the author sees their private day thread; a different non-PI actor does not", async () => {
    const { env } = makeEnv(FX)
    await handlePostDayActivity('2026-07-22', dayPostReq(NON_PI_EMAIL, { content: 'my private morning note' }), NATE, env)

    const mine = await handleGetDayActivity('2026-07-22', userGetReq(NON_PI_EMAIL), env)
    const mineBody = await mine.json() as { data: Array<{ body: string }> }
    expect(mineBody.data.some(r => r.body.includes('private morning note'))).toBe(true)

    const theirs = await handleGetDayActivity('2026-07-22', userGetReq('someone-else@umn.edu'), env)
    const theirsBody = await theirs.json() as { data: Array<{ body: string }> }
    expect(theirsBody.data.some(r => r.body.includes('private morning note'))).toBe(false)
  })

  it('the PI sees everyone\'s day threads (Rule 70)', async () => {
    const { env } = makeEnv(FX)
    await handlePostDayActivity('2026-07-22', dayPostReq(NON_PI_EMAIL, { content: 'natems private note' }), NATE, env)
    const res = await handleGetDayActivity('2026-07-22', piReq(), env)
    const body = await res.json() as { data: Array<{ body: string }> }
    expect(body.data.some(r => r.body.includes('natems private note'))).toBe(true)
  })
})
