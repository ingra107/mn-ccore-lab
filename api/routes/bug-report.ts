import type { Env } from '../helpers'
import { json, error } from '../helpers'

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
  lines.push(`- **Reported:** ${new Date().toISOString()}`)

  // Handle screenshot upload to R2 if provided
  let screenshotUrl: string | null = null
  if (body.screenshot && body.screenshot.startsWith('data:image/')) {
    try {
      const r2Bucket = (env as Record<string, unknown>).FILES as {
        put: (key: string, body: ArrayBuffer, options?: Record<string, unknown>) => Promise<unknown>
      } | undefined

      if (r2Bucket) {
        const base64Data = body.screenshot.split(',')[1]
        const binaryStr = atob(base64Data)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }

        const ext = body.screenshot.includes('image/png') ? 'png' : 'jpg'
        const key = `bug-screenshots/${Date.now()}.${ext}`
        await r2Bucket.put(key, bytes.buffer, {
          httpMetadata: { contentType: `image/${ext}` },
        })

        // R2 public URL via the files API
        screenshotUrl = `/api/files/${key}`
      }
    } catch (e) {
      // Screenshot upload failed — continue without it
      lines.push(`- **Screenshot upload failed:** ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  if (screenshotUrl) {
    lines.push('')
    lines.push('**Screenshot:**')
    lines.push(`![Bug screenshot](https://mn-ccore-lab.pages.dev${screenshotUrl})`)
  } else if (body.screenshot) {
    // Base64 too large for GitHub issue body (65K limit). Note it was provided but couldn't be uploaded.
    lines.push('')
    lines.push('**Screenshot:** Provided but R2 upload unavailable. Ask reporter to re-paste in issue comments.')
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
