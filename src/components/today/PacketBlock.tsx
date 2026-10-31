// Prepared first step ("packet") atop the task drawer. Nick's picks 2026-10-30:
// B1 drawer + B4 instruction first, the draft never collapsed, orange when the
// inputs changed since it was prepared. Contract:
// Peripheral-Brain/Context/Decisions/2026-10-30-first-step-packet.md.
//
//   GET  /api/tasks/:id/packet       -> { packet, version, freshness } | { packet: null }
//   POST /api/packets/:id/use        {version, manifest_hash} -> 200 {url} | 409 {reasons}
//   POST /api/packets/:id/dismiss
//
// The types below mirror that decision doc. Nothing here sends mail: Use opens
// the existing Gmail draft in a new tab and records the action.

import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { kindCopy, segmentBody } from '../../lib/packetBody'
import type { DeliverableKind } from '../../../shared/packets'

export type PacketFreshnessState = 'ready' | 'changed' | 'unverified'

export interface PacketCall { title: string; decision: string; anchor: string }

export interface PacketVersion {
  /** Version number, sent back on Use for the compare-and-set. */
  version: number
  /** Hash of the input manifest the freshness check compares, sent back on Use. */
  manifest_hash: string
  instruction: string
  minutes?: number | null
  body: string
  calls: PacketCall[]
  deliverable: { kind: DeliverableKind; url?: string | null; to?: string | string[] | null; subject?: string | null; title?: string | null }
}

export interface PacketPayload {
  packet: { id: string; used_at?: string | null; closed_at?: string | null } | null
  version?: PacketVersion
  // Reasons arrive as shared/packets.ts PacketReason objects; asText reads them.
  freshness?: { state: PacketFreshnessState; reasons: unknown[] }
}

const packetQueryKey = (taskId: string) => ['task-packet', taskId] as const

async function fetchPacket(taskId: string): Promise<PacketPayload> {
  const res = await fetch(`/api/tasks/${taskId}/packet`)
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  return res.json() as Promise<PacketPayload>
}

class UseRefused extends Error {
  reasons: string[]
  constructor(reasons: string[]) { super('packet changed'); this.reasons = reasons }
}

// The Hub sends reasons as PacketReason objects (shared/packets.ts); `text` is
// the human line.
const asText = (r: unknown): string => {
  if (typeof r === 'string') return r
  if (r && typeof r === 'object') {
    const o = r as { text?: unknown; message?: unknown }
    if (o.text != null) return String(o.text)
    if (o.message != null) return String(o.message)
  }
  return String(r)
}

export function PacketBlock({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const key = packetQueryKey(taskId)
  const query = useQuery({ queryKey: key, queryFn: () => fetchPacket(taskId), staleTime: 30 * 1000, retry: false })
  const [refused, setRefused] = useState<string[] | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const [done, setDone] = useState<'used' | 'dismissed' | null>(null)

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: key })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  const data = query.data
  const packet = data?.packet ?? null
  const version = data?.version

  const use = useMutation({
    mutationFn: async () => {
      if (!packet || !version) throw new Error('no packet')
      // Open the tab now, inside the click, so the browser does not block it
      // after the await. Closed again if the POST refuses.
      setCopyFailed(false)
      const isGmail = version.deliverable.kind === 'gmail_draft'
      const tab = isGmail ? window.open('about:blank', '_blank') : null
      try {
        const res = await fetch(`/api/packets/${packet.id}/use`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: version.version, manifest_hash: version.manifest_hash }),
        })
        if (res.status === 409) {
          const j = (await res.json().catch(() => ({}))) as { code?: string; reasons?: unknown[]; url?: string | null; close_reason?: string }
          // Already used: the draft exists, so reopen it rather than refuse.
          if (j.code === 'already_used' && !isGmail) return null
          if (j.code === 'already_used' && j.url) {
            if (tab) tab.location.href = j.url
            else window.open(j.url, '_blank')
            return j.url
          }
          if (j.code === 'closed') throw new UseRefused([`This packet was closed (${j.close_reason ?? 'closed'}).`])
          throw new UseRefused((j.reasons ?? []).map(asText))
        }
        if (!res.ok) throw new Error(`use failed: ${res.status}`)
        if (!isGmail) {
          if (version.deliverable.kind === 'doc_text') {
            try { await navigator.clipboard.writeText(version.body) } catch { setCopyFailed(true) }
          }
          return null
        }
        const { url } = (await res.json()) as { url: string | null }
        if (!url) { tab?.close(); return null }
        if (tab) tab.location.href = url
        else window.open(url, '_blank')
        return url
      } catch (e) {
        tab?.close()
        throw e
      }
    },
    onSuccess: () => { setRefused(null); setDone('used'); refreshAll() },
    onError: (e) => { if (e instanceof UseRefused) setRefused(e.reasons) },
  })

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!packet) throw new Error('no packet')
      const res = await fetch(`/api/packets/${packet.id}/dismiss`, { method: 'POST' })
      if (!res.ok) throw new Error(`dismiss failed: ${res.status}`)
    },
    onSuccess: () => { setDone('dismissed'); refreshAll() },
  })

  if (done === 'dismissed') {
    return <div className="tk-pk tk-pk-note" data-testid="packet-dismissed">{kindCopy(version?.deliverable.kind ?? 'gmail_draft').dismissed}</div>
  }
  if (!packet || !version || !data?.freshness) return null

  const state = data.freshness.state
  const reasons = data.freshness.reasons ?? []
  const segs = segmentBody(version.body, version.calls)
  const blocked = refused !== null
  const d = version.deliverable
  const copy = kindCopy(d.kind)
  const toText = Array.isArray(d.to) ? d.to.join(', ') : d.to

  return (
    <section className="tk-pk" data-testid="packet-block" data-state={state} aria-label="Prepared first step">
      <div className="tk-pk-fresh" data-testid="packet-freshness">
        {state === 'ready' && <span className="tk-tag tk-ac first">Ready</span>}
        {state === 'changed' && <span className="tk-tag tk-stale first">Changed</span>}
        {state === 'unverified' && <span className="tk-tag tk-n first">Unverified</span>}
        <span className="tk-pk-fl">
          {state === 'ready' && 'Prepared from what the task and thread say now.'}
          {state === 'changed' && 'Something changed since this was prepared.'}
          {state === 'unverified' && 'Not checked against the latest.'}
          {reasons.length > 0 && ` ${reasons.map(asText).join('; ')}`}
        </span>
      </div>

      <p className="tk-pk-instr" data-testid="packet-instruction">
        <b>Start here:</b> {version.instruction}
        {version.minutes ? <span className="tk-pk-min"> {version.minutes} min</span> : null}
      </p>

      {version.calls.length > 0 && (
        <ol className="tk-pk-calls" data-testid="packet-calls">
          {version.calls.map((c, i) => (
            <li key={i} value={i + 1}>
              <span className="tk-pk-n" aria-hidden="true">{i + 1}</span>
              <span><b>{c.title}</b> <span className="tk-pk-dec">{c.decision}</span></span>
            </li>
          ))}
        </ol>
      )}

      <div className="tk-pk-draft" data-testid="packet-draft">
        {(toText || d.subject) && (
          <div className="tk-pk-meta">
            {toText && <span>To {toText}</span>}
            {d.subject && <span>{d.subject}</span>}
          </div>
        )}
        <div className="tk-pk-body">
          {segs.map((s, i) => (
            s.n
              ? <mark key={i} className="tk-pk-hl" data-n={s.n}>{s.text}<sup>{s.n}</sup></mark>
              : <Fragment key={i}>{s.text}</Fragment>
          ))}
        </div>
      </div>

      {blocked && (
        <div className="tk-pk-why" role="alert" data-testid="packet-refused">
          <b>This changed before you opened it.</b>
          {refused!.length > 0 && <ul>{refused!.map((r, i) => <li key={i}>{r}</li>)}</ul>}
        </div>
      )}
      {use.isError && !blocked && <div className="tk-pk-why" role="alert">{d.kind === 'gmail_draft' ? 'Could not open the draft. Try again.' : 'Could not mark this as used. Try again.'}</div>}
      {done === 'used' && (
        <div className="tk-pk-note">
          {d.kind === 'doc_text' && copyFailed ? 'Marked as used, but the copy failed. Select the text above and copy it.' : copy.used}
        </div>
      )}
      {d.kind === 'doc_text' && d.url && (
        <a className="tk-pk-link" href={d.url} target="_blank" rel="noreferrer">Open the doc</a>
      )}

      <div className="tk-pk-acts">
        {blocked ? (
          <button
            type="button" className="tk-ask-go"
            onClick={() => { setRefused(null); use.reset(); refreshAll() }}
            disabled={query.isFetching}
          >Refresh, then use</button>
        ) : (
          <button type="button" className="tk-ask-go" onClick={() => use.mutate()} disabled={use.isPending}>{copy.button}</button>
        )}
        <button type="button" className="tk-pk-dis" onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>Dismiss</button>
      </div>
    </section>
  )
}
