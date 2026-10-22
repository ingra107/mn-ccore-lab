/**
 * Weekly member mail preview (read-only starter, consult 2026-10-22 move 1).
 *
 *   npx tsx scripts/weekly-member-mail-preview.ts [outDir]
 *
 * Renders, for every team member who is on a project or holds an open task, the
 * email they would get. Nothing is sent; no secret is read. Reuses the real
 * `handleDigestPreview` (api/routes/digest-email.ts) for the task + meeting body,
 * then appends two weekly sections that digest-email does not have:
 *   - "Products that moved on your projects" (products.updated_at, last 7 days,
 *     on projects where the member is in project_members)
 *   - "Waiting on you" (products.waiting_on naming the member, or the task
 *     status 'waiting' assigned to them)
 *
 * How: pulls the needed rows from prod D1 ONCE per table (scripts/wrangler-d1,
 * SELECT only) into an in-memory node:sqlite, then hands handleDigestPreview a
 * D1-shaped shim over it. The digest SQL runs unchanged against real data.
 *
 * Limits: activity_log and meetings are loaded for the last 7 days only; the
 * digest body shows overdue, due today, due in 7 days. Open tasks beyond that
 * window are counted in the index but not listed in the digest body.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { d1Select } from './_lib/d1-readonly'
import { DatabaseSync } from 'node:sqlite'
import { handleDigestPreview } from '../api/routes/digest-email'
import type { Env } from '../api/helpers'

const OUT = resolve(process.argv[2] ?? 'C:/Users/ingra107/Peripheral-Brain/Scratch/consults/out/member-mail')

type Row = Record<string, string | number | null>

const d1 = d1Select<Row>

const mem = new DatabaseSync(':memory:')

function load(table: string, cols: string[], sql: string): number {
  const rows = d1(sql)
  mem.exec(`CREATE TABLE ${table} (${cols.join(', ')})`)
  const ins = mem.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
  for (const row of rows) ins.run(...cols.map(c => (row[c] ?? null) as string | number | null))
  return rows.length
}

// ---- D1-shaped shim over the in-memory copy (prepare/bind/all/first) ----
function shim() {
  const prepare = (sql: string) => {
    let args: unknown[] = []
    const stmt = {
      bind(...a: unknown[]) { args = a; return stmt },
      async all() { return { results: mem.prepare(sql).all(...(args as never[])), success: true } },
      async first<T>() { return (mem.prepare(sql).get(...(args as never[])) ?? null) as T | null },
      async run() { throw new Error('read-only shim') },
    }
    return stmt
  }
  return { prepare }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

async function main() {
  const counts: Record<string, number> = {}
  counts.team_members = load('team_members', ['slug', 'name', 'role', 'member_type', 'email'],
    `SELECT slug, name, role, member_type, email FROM team_members WHERE slug IS NOT NULL`)
  counts.tasks = load('tasks', ['id', 'title', 'due_date', 'priority', 'status', 'project_id', 'assignee', 'completed', 'deleted_at'],
    `SELECT id, title, due_date, priority, status, project_id, assignee, completed, deleted_at
     FROM tasks WHERE deleted_at IS NULL AND status != 'done' AND completed = 0`)
  counts.meetings = load('meetings', ['id', 'title', 'date', 'notes'],
    `SELECT id, title, date, substr(notes, 1, 200) AS notes FROM meetings WHERE date >= date('now', '-7 days')`)
  counts.activity_log = load('activity_log', ['type', 'description', 'timestamp'],
    `SELECT type, description, timestamp FROM activity_log WHERE timestamp >= datetime('now', '-3 days')`)
  counts.projects = load('projects', ['id', 'title', 'slug'],
    `SELECT id, title, slug FROM projects WHERE deleted_at IS NULL`)
  counts.project_members = load('project_members', ['project_id', 'member_slug'],
    `SELECT project_id, member_slug FROM project_members`)
  counts.products = load('products', ['id', 'project_id', 'kind', 'stage', 'title', 'waiting_on', 'updated_at', 'stage_entered_at'],
    `SELECT id, project_id, kind, stage, title, waiting_on, updated_at, stage_entered_at
     FROM products WHERE deleted_at IS NULL`)
  console.error('loaded', JSON.stringify(counts))

  const env = { DB: shim() } as unknown as Env
  mkdirSync(OUT, { recursive: true })

  const members = mem.prepare(
    `SELECT slug, name, role, member_type, email FROM team_members
     WHERE slug IN (SELECT member_slug FROM project_members)
        OR slug IN (SELECT assignee FROM tasks WHERE assignee IS NOT NULL)
     ORDER BY name`,
  ).all() as Row[]
  const inactive = mem.prepare(
    `SELECT slug, name FROM team_members
     WHERE slug NOT IN (SELECT member_slug FROM project_members)
       AND slug NOT IN (SELECT assignee FROM tasks WHERE assignee IS NOT NULL)
     ORDER BY name`,
  ).all() as Row[]

  const idxRows: string[] = []
  for (const m of members) {
    const slug = String(m.slug)
    const name = String(m.name)
    const firstName = name.split(' ')[0]

    const open = (mem.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE assignee = ?`).get(slug) as Row).n as number
    const overdue = (mem.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE assignee = ? AND due_date < date('now')`).get(slug) as Row).n as number
    const moved = mem.prepare(
      `SELECT pr.kind, pr.stage, pr.title AS ptitle, pj.title AS jtitle, pr.updated_at
       FROM products pr JOIN projects pj ON pj.id = pr.project_id
       WHERE pr.project_id IN (SELECT project_id FROM project_members WHERE member_slug = ?)
         AND pr.updated_at >= datetime('now', '-7 days')
       ORDER BY pr.updated_at DESC LIMIT 10`,
    ).all(slug) as Row[]
    const waitingProducts = mem.prepare(
      `SELECT pr.kind, pr.stage, pr.title AS ptitle, pj.title AS jtitle, pr.waiting_on
       FROM products pr JOIN projects pj ON pj.id = pr.project_id
       WHERE pr.waiting_on IS NOT NULL AND pr.waiting_on != ''
         AND (lower(pr.waiting_on) LIKE '%' || lower(?) || '%' OR lower(pr.waiting_on) LIKE '%' || lower(?) || '%')
       LIMIT 10`,
    ).all(slug, firstName) as Row[]
    const waitingTasks = mem.prepare(
      `SELECT title FROM tasks WHERE assignee = ? AND status = 'waiting' LIMIT 10`,
    ).all(slug) as Row[]

    const res = await handleDigestPreview(new URL(`https://x.invalid/api/digest-preview?member=${encodeURIComponent(slug)}`), env)
    let html = await res.text()
    if (res.status !== 200 || html.includes('<h2>Error</h2>')) {
      writeFileSync(resolve(OUT, `${slug}.html`), html, 'utf8')
      idxRows.push(`<tr><td>${esc(name)}</td><td>${esc(m.role ?? '')}</td><td colspan="6"><b>ERROR (status ${res.status}); email not rendered</b></td></tr>`)
      console.error(`${slug}: ERROR status ${res.status}`)
      continue
    }

    const sec = (title: string, items: string[]) =>
      items.length
        ? `<div style="max-width:600px;margin:16px auto;font-family:sans-serif;"><h3 style="font-size:14px;color:#334155;">${esc(title)} (${items.length})</h3><ul style="font-size:13px;color:#475569;">${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`
        : ''
    const extra =
      sec('Products that moved on your projects (last 7 days)',
        moved.map(r => `${esc(r.ptitle ?? r.jtitle)} <em>(${esc(r.kind)}, now ${esc(r.stage)}; project ${esc(r.jtitle)})</em>`)) +
      sec('Waiting on you',
        [...waitingProducts.map(r => `${esc(r.ptitle ?? r.jtitle)} <em>(${esc(r.kind)}/${esc(r.stage)}): ${esc(r.waiting_on)}</em>`),
         ...waitingTasks.map(r => esc(r.title))])
    html = html.includes('</body>') ? html.replace('</body>', `${extra}</body>`) : html + extra

    const empty = open === 0 && moved.length === 0 && waitingProducts.length === 0 && waitingTasks.length === 0
    writeFileSync(resolve(OUT, `${slug}.html`), html, 'utf8')
    idxRows.push(
      `<tr><td><a href="${esc(slug)}.html">${esc(name)}</a></td><td>${esc(m.role ?? '')}</td><td>${open}</td><td>${overdue}</td><td>${moved.length}</td><td>${waitingProducts.length + waitingTasks.length}</td><td>${m.email ? 'yes' : 'NO EMAIL'}</td><td>${empty ? '<b>EMPTY: would not send</b>' : 'would send'}</td></tr>`,
    )
    console.error(`${slug}: open=${open} overdue=${overdue} moved=${moved.length} waiting=${waitingProducts.length + waitingTasks.length}${empty ? ' EMPTY' : ''}`)
  }

  const index = `<!doctype html><meta charset="utf-8"><title>Weekly member mail preview</title>
<body style="font-family:sans-serif;padding:24px;color:#0f172a;">
<h2>Weekly member mail preview (${new Date().toISOString().slice(0, 10)})</h2>
<p>Nothing sent. Rendered from prod D1 read-only. Members with no open task, no moved product and no ask waiting would receive no email.</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px;">
<tr><th>Member</th><th>Role</th><th>Open tasks</th><th>Overdue</th><th>Products moved 7d</th><th>Waiting on them</th><th>Email on file</th><th>Verdict</th></tr>
${idxRows.join('\n')}
</table>
<p>Not rendered (on no project and no open task): ${inactive.map(r => esc(r.name)).join(', ') || 'none'}.</p>
</body>`
  writeFileSync(resolve(OUT, 'index.html'), index, 'utf8')
  console.error(`wrote ${members.length} emails + index.html to ${OUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
