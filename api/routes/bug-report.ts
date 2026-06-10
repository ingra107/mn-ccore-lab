import type { Env, AuthUser } from '../helpers'
import { json, error, isPiRequest } from '../helpers'
import { nowInstant } from '../lib/time'

const REPO = 'ingra107/mn-ccore-lab'

const VALID_BUG_STATUS = new Set(['open', 'resolved', 'dismissed'])

interface BugReportBody {
  description: string
  pageUrl?: string
  viewport?: string
  theme?: string
  screenshot?: string // base64 data URL
}

interface BugReportRow {
  id: string
  description: string
  page_url: string | null
  viewport: string | null
  theme: string | null
  issue_number: number | null
  issue_url: string | null
  status: string
  reporter: string | null
  created_at: string
  resolved_at: string | null
}

/** Mint a stable, sortable-ish id for a bug report row. */
function newBugId(): string {
  return `bug_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * POST /api/bug-report — Create a GitHub Issue with optional screenshot AND
 * persist the report to the `bug_reports` D1 table (schema v76).
 *
 * The D1 row is what the Bug Squasher (scripts/bug-squasher.bat, ⌘K "Bug
 * Squasher") lists + resolves. The GitHub Issue is unchanged (human-readable
 * tracking + screenshot embed). If GITHUB_TOKEN is missing we still record the
 * D1 row so the squasher queue stays complete; the issue fields are left null.
 *
 * Requires GITHUB_TOKEN secret (repo scope) for the GitHub Issue half.
 */
export async function handleBugReport(
  request: Request,
  env: Env,
  user?: AuthUser | null,
): Promise<Response> {
  const body = await request.json() as BugReportBody
  if (!body.description?.trim()) {
    return error('description is required', 400)
  }
  const description = body.description.trim()

  const githubToken = (env as Record<string, unknown>).GITHUB_TOKEN as string | undefined

  let issueNumber: number | null = null
  let issueUrl: string | null = null
  let ghFailure: string | null = null

  if (githubToken) {
    // Build issue body with auto-captured context
    const lines: string[] = []
    lines.push(description)
    lines.push('')
    lines.push('---')
    lines.push('**Auto-captured context:**')
    if (body.pageUrl) lines.push(`- **Page:** ${body.pageUrl}`)
    if (body.viewport) lines.push(`- **Viewport:** ${body.viewport}`)
    if (body.theme) lines.push(`- **Theme:** ${body.theme}`)
    lines.push(`- **Reported:** ${nowInstant()}`)

    // Screenshot: client compresses to JPEG ~30-80KB, embed as base64 markdown image
    if (body.screenshot && body.screenshot.startsWith('data:image/')) {
      if (body.screenshot.length < 60000) {
        lines.push('')
        lines.push('**Screenshot:**')
        lines.push(`![screenshot](${body.screenshot})`)
      } else {
        lines.push('')
        lines.push('**Screenshot:** Provided but too large for inline embed. Ask reporter to paste in comments.')
      }
    }

    const issueBody = {
      title: `[Bug] ${description.slice(0, 80)}${description.length > 80 ? '...' : ''}`,
      body: lines.join('\n'),
      labels: ['bug'],
    }

    const ghRes = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'mn-ccore-lab-hub',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(issueBody),
    })

    if (ghRes.ok) {
      const ghData = await ghRes.json() as { number: number; html_url: string }
      issueNumber = ghData.number
      issueUrl = ghData.html_url
    } else {
      const ghError = await ghRes.text()
      ghFailure = `GitHub API error: ${ghRes.status} ${ghError.slice(0, 200)}`
    }
  }

  // Persist to the D1 queue regardless of GitHub outcome — the squasher reads
  // this, not GitHub. A row without an issue_number is still actionable.
  const id = newBugId()
  const createdAt = nowInstant()
  const reporter = user?.email ?? null
  await env.DB.prepare(
    `INSERT INTO bug_reports
       (id, description, page_url, viewport, theme, issue_number, issue_url, status, reporter, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL)`,
  ).bind(
    id,
    description,
    body.pageUrl ?? null,
    body.viewport ?? null,
    body.theme ?? null,
    issueNumber,
    issueUrl,
    reporter,
    createdAt,
  ).run()

  // If GitHub was configured but failed, surface a 502 — but the D1 row is
  // already written so the report isn't lost. If GITHUB_TOKEN was simply
  // absent we succeed (the D1 queue is the source of truth for the squasher).
  if (ghFailure) {
    return error(ghFailure, 502)
  }

  return json({
    data: {
      id,
      issue_number: issueNumber,
      issue_url: issueUrl,
      status: 'open',
    },
  }, 201)
}

/**
 * GET /api/bug-reports?status=open — list bug reports for the Bug Squasher.
 *
 * PI / API-key gated (same gating idiom as the PB-sync reads): the squasher
 * authenticates with the Bearer PB_API_KEY. Team members must not enumerate
 * the bug queue. `status` defaults to 'open'; pass status=all for every row.
 */
export async function handleListBugReports(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403)
  }

  const url = new URL(request.url)
  const statusParam = (url.searchParams.get('status') || 'open').toLowerCase()

  let rows: BugReportRow[]
  if (statusParam === 'all') {
    const res = await env.DB.prepare(
      `SELECT id, description, page_url, viewport, theme, issue_number, issue_url,
              status, reporter, created_at, resolved_at
         FROM bug_reports
        ORDER BY created_at DESC
        LIMIT 200`,
    ).all<BugReportRow>()
    rows = res.results ?? []
  } else {
    if (!VALID_BUG_STATUS.has(statusParam)) {
      return error(`invalid status filter '${statusParam}' (open|resolved|dismissed|all)`, 400)
    }
    const res = await env.DB.prepare(
      `SELECT id, description, page_url, viewport, theme, issue_number, issue_url,
              status, reporter, created_at, resolved_at
         FROM bug_reports
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT 200`,
    ).bind(statusParam).all<BugReportRow>()
    rows = res.results ?? []
  }

  return json({ data: rows, count: rows.length })
}

/**
 * POST /api/bug-reports/:id/status — set a bug report's status (Bug Squasher
 * marks bugs resolved/dismissed as it works through them).
 *
 * PI / API-key gated. Body: { status: 'open' | 'resolved' | 'dismissed' }.
 * Leaving 'open' clears resolved_at; entering resolved/dismissed stamps it
 * (UTC instant). Returns the updated row.
 */
export async function handleUpdateBugReportStatus(
  id: string,
  request: Request,
  env: Env,
): Promise<Response> {
  if (!(await isPiRequest(request, env))) {
    return error('Forbidden — PI access only', 403)
  }

  const body = await request.json().catch(() => ({})) as { status?: string }
  const status = (body.status || '').toLowerCase()
  if (!VALID_BUG_STATUS.has(status)) {
    return error("status must be one of 'open' | 'resolved' | 'dismissed'", 400)
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM bug_reports WHERE id = ?`,
  ).bind(id).first<{ id: string }>()
  if (!existing) {
    return error('bug report not found', 404)
  }

  // resolved_at: stamped when leaving 'open', cleared when returning to 'open'.
  const resolvedAt = status === 'open' ? null : nowInstant()
  await env.DB.prepare(
    `UPDATE bug_reports SET status = ?, resolved_at = ? WHERE id = ?`,
  ).bind(status, resolvedAt, id).run()

  const updated = await env.DB.prepare(
    `SELECT id, description, page_url, viewport, theme, issue_number, issue_url,
            status, reporter, created_at, resolved_at
       FROM bug_reports
      WHERE id = ?`,
  ).bind(id).first<BugReportRow>()

  return json({ data: updated })
}
