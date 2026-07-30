// The presigned-R2 upload sequence (presign -> PUT -> record) used by every
// paste/drop/attach composer surface. Extracted 2026-07-30 (backlog #545):
// SmartCompose and TaskDetailPanel's OverviewQuickAdd each hand-rolled this
// exact 3-call chain and had already needed the SAME bug fix applied twice,
// by hand, in parallel (2026-07-07 paste-to-image work). A sibling copy in
// ProjectDetail's quick compose swallows a failed upload with no user-facing
// error at all — proof the copies had already started to drift.
//
// This function is the ONE place the network sequence lives. Callers keep
// their own preview/progress state and toast/insert UI — those legitimately
// differ per surface (cursor-aware insert vs append-only, undo-toast vs
// plain toast, extra query-key invalidation) and are NOT folded in here.
export interface R2UploadContext {
  /** Server-side context.type for /api/upload/url. */
  type: string
  /** Server-side context.id (e.g., task slug, project slug, meeting id). */
  id: string
  /** Overrides the entityType used at /api/upload/done. Defaults to `type`. */
  entityType?: string
}

/**
 * Runs the presign -> PUT -> done chain for one file. Throws a descriptive
 * Error on any step's failure; callers own toasting/logging it — this
 * function never swallows a failure silently (ethos #3).
 */
export async function uploadFileToR2(file: File, ctx: R2UploadContext): Promise<{ url: string; key: string }> {
  const urlRes = await fetch('/api/upload/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      context: { type: ctx.type, id: ctx.id },
    }),
  })
  if (!urlRes.ok) throw new Error(`Failed to get upload URL (${urlRes.status}) — R2 may not be configured`)
  const urlData = await urlRes.json() as { data?: { uploadUrl?: string; key?: string } }
  if (!urlData.data?.uploadUrl || !urlData.data?.key) throw new Error('Failed to get upload URL — R2 may not be configured')

  const putRes = await fetch(urlData.data.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`)

  const doneRes = await fetch('/api/upload/done', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: urlData.data.key,
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      entityType: ctx.entityType ?? ctx.type,
      entityId: ctx.id,
    }),
  })
  if (!doneRes.ok) throw new Error(`Recording attachment failed (${doneRes.status})`)
  const doneData = await doneRes.json() as { data?: { url?: string } }
  // Same-origin, non-expiring raw-bytes link (api/routes/uploads.ts
  // handleUploadDone) — falls back to constructing it client-side only if
  // an older/unpatched worker is still serving the response.
  const url = doneData.data?.url ?? `/api/files/${urlData.data.key}/raw`
  return { url, key: urlData.data.key }
}
