// POST /api/tasks/batch answers 200 even when it refused some ids: the verdict is in
// the body ({ data: { ok, applied, failed } }). Every caller reads it here, so none
// can announce a whole batch that only partly landed.

export interface BatchResult {
  applied: string[]
  failed: { id: string; reason: string }[]
}

export function readBatchResult(response: unknown, sent: readonly string[]): BatchResult {
  const data = (response as { data?: { ok?: unknown; failed?: unknown } } | null | undefined)?.data
  const listed = Array.isArray(data?.failed) ? (data.failed as { id?: unknown; reason?: unknown }[]) : []
  const failed = listed
    .filter((f): f is { id: string; reason?: unknown } => typeof f?.id === 'string')
    .map((f) => ({ id: f.id, reason: typeof f.reason === 'string' ? f.reason : '' }))
  // ok:false with nobody named: we cannot say which landed, so none is claimed.
  if (failed.length === 0 && data?.ok === false) {
    return { applied: [], failed: sent.map((id) => ({ id, reason: '' })) }
  }
  const refused = new Set(failed.map((f) => f.id))
  return { applied: sent.filter((id) => !refused.has(id)), failed }
}

// The route's reason reads "<mutation status> — <why>"; a person wants the why.
const readable = (reason: string) => reason.split(' — ').pop()?.trim() || reason.trim()

function reasonsPhrase(failed: BatchResult['failed']): string {
  const reasons = [...new Set(failed.map((f) => readable(f.reason)).filter(Boolean))]
  if (reasons.length === 0) return ''
  const shown = reasons.slice(0, 2).join('; ')
  const rest = reasons.length - 2
  return `: ${shown}${rest > 0 ? `; and ${rest} more reason${rest === 1 ? '' : 's'}` : ''}`
}

/**
 * Say what a batch did, in one toast. `done` words the part that landed, and a
 * caller without it stays quiet on success. Returns the refused ids, which a
 * selection keeps so the person can see them and try again.
 */
export function reportBatch(
  toast: { showSuccess: (message: string) => void; showError: (message: string) => void },
  response: unknown,
  sent: readonly string[],
  done?: (count: number) => string,
): string[] {
  const { applied, failed } = readBatchResult(response, sent)
  if (failed.length === 0) {
    if (done) toast.showSuccess(done(applied.length))
    return []
  }
  const refused = applied.length > 0 && done
    ? `${done(applied.length)}. ${failed.length} not changed`
    : `${failed.length} task${failed.length === 1 ? '' : 's'} not changed`
  toast.showError(`${refused}${reasonsPhrase(failed)}`)
  return failed.map((f) => f.id)
}
