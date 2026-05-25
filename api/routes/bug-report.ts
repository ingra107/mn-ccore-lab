import type { Env } from '../helpers'
import { json, error } from '../helpers'
import { nowInstant } from '../lib/time'

const REPO = 'ingra107/mn-ccore-lab'

interface BugReportBody {
  description: string
  pageUrl?: string
  viewport?: string
  theme?: string
  screenshot?: string // base64 data URL
}

/**
 * POST /api/bug-report — Create a GitHub Issue with optional screenshot.
 *
 * If a screenshot is provided (base64 data URL), it's uploaded to R2 first,
 * then linked in the issue body as a markdown image. GitHub Issues don't
 * support direct base64 image embedding, so R2 gives us a stable URL.
 *
 * Requires GITHUB_TOKEN secret (repo scope) on the Cloudflare Pages project.
 */
export async function handleBugReport(
  request: Request,
  env: Env,
): Promise<Response> {
  const githubToken = (env as Record<string, unknown>).GITHUB_TOKEN as string | undefined
  if (!githubToken) {
    return error('GITHUB_TOKEN not configured', 503)
  }

  const body = await request.json() as BugReportBody
  if (!body.description?.trim()) {
    return error('description is required', 400)
  }

  // Build issue body with auto-captured context
  const lines: string[] = []
  lines.push(body.description.trim())
  lines.push('')
  lines.push('---')
  lines.push('**Auto-captured context:**')
  if (body.pageUrl) lines.push(`- **Page:** ${body.pageUrl}`)
  if (body.viewport) lines.push(`- **Viewport:** ${body.viewport}`)
  if (body.theme) lines.push(`- **Theme:** ${body.theme}`)
  lines.push(`- **Reported:** ${nowInstant()}`)

  // Screenshot: client compresses to JPEG ~30-80KB, embed as base64 markdown image
  if (body.screenshot && body.screenshot.startsWith('data:image/')) {
    // Safety check: if still over 45KB base64 (~33KB binary), truncate
    if (body.screenshot.length < 60000) {
      lines.push('')
      lines.push('**Screenshot:**')
      lines.push(`![screenshot](${body.screenshot})`)
    } else {
      lines.push('')
      lines.push('**Screenshot:** Provided but too large for inline embed. Ask reporter to paste in comments.')
    }
  }

  // Create GitHub Issue
  const issueBody = {
    title: `[Bug] ${body.description.trim().slice(0, 80)}${body.description.trim().length > 80 ? '...' : ''}`,
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

  if (!ghRes.ok) {
    const ghError = await ghRes.text()
    return error(`GitHub API error: ${ghRes.status} ${ghError.slice(0, 200)}`, 502)
  }

  const ghData = await ghRes.json() as { number: number; html_url: string }

  return json({
    data: {
      issue_number: ghData.number,
      issue_url: ghData.html_url,
    },
  }, 201)
}
