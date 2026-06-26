// LaunchLogPanel.tsx — Nick-private "My Launches" recovery surface.
//
// Shows the requesting user's own launch_log rows (GET /api/launch-log,
// scoped server-side to requested_by). Each row has a re-fire button that:
//   - computer-origin: POSTs /refire (creates a new row server-side) AND fires
//     the mnccore:// protocol URI client-side via useProtocolLaunch. The server
//     cannot fire local URIs, so client-side firing is mandatory here (§backlog #222).
//   - mobile-origin: just POSTs /refire (creates a pending row for the home poller).
//
// `statusLabel` is exported as a pure function for unit testing.

import { useEffect, useState } from 'react'
import { fetchApi } from '../../lib/api'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'
import { buildQuickChatUri } from '../../lib/urlClassify'

// ── Pure helper — exported for unit tests ────────────────────────────────────

export function statusLabel(s: string): string {
  switch (s) {
    case 'launched':  return 'Launched'
    case 'pending':   return 'Waiting for home'
    case 'completed': return 'Completed'
    case 'failed':    return 'Failed'
    case 'expired':   return 'Expired (home was offline)'
    default:          return s
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LaunchRow {
  id: string
  tag: string
  seed: string
  origin: string
  status: string
  created_at: string
  project_slug: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LaunchLogPanel() {
  const [rows, setRows] = useState<LaunchRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const { launch } = useProtocolLaunch()

  const load = () =>
    fetchApi<LaunchRow[]>('/api/launch-log')
      .then((r) => setRows(r.data ?? []))
      .catch((e) => setErr(e instanceof Error ? e.message : 'load failed'))

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refire = async (row: LaunchRow) => {
    // Always create a new row server-side (preserves history — no mutation).
    await fetchApi(`/api/launch-log/${row.id}/refire`, { method: 'POST' })

    if (row.origin === 'computer') {
      // Server cannot fire mnccore:// (browser-only); do it here instead.
      // tag==='workon' ideally uses buildSeededWorkOnUri but needs a folder path
      // not stored in the log; fallback to quickchat-style is acceptable per brief.
      const uri = buildQuickChatUri(row.seed)
      await launch(uri, {
        successMessage: `Re-firing @${row.tag}…`,
        copyText: row.seed || undefined,
        copyMessage: `@${row.tag} seed copied — paste if the handler didn't open`,
      })
    }
    // mobile-origin: pending row created above; home poller will pick it up.
    load()
  }

  if (err) return <div className="text-sm" style={{ color: 'var(--maroon)' }}>Launches: {err}</div>

  return (
    <div className="flex flex-col gap-1">
      {rows.length === 0 ? (
        <p style={{ fontSize: 'var(--text-label)', color: 'var(--slate)', opacity: 0.75, textAlign: 'center', padding: '12px 0' }}>
          No launches yet.
        </p>
      ) : (
        rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2"
            style={{
              fontSize: 'var(--text-label)',
              borderBottom: '1px solid var(--border-subtle)',
              padding: '4px 0',
              minHeight: 28,
            }}
          >
            <span style={{ fontFamily: 'monospace', color: 'var(--teal)', flexShrink: 0 }}>
              @{r.tag}
            </span>
            <span
              className="flex-1 truncate"
              title={r.seed}
              style={{ color: 'var(--ink)', opacity: 0.85 }}
            >
              {r.seed || '(no seed)'}
            </span>
            <span style={{ color: 'var(--slate)', opacity: 0.75, flexShrink: 0 }}>
              {statusLabel(r.status)}
            </span>
            <button
              type="button"
              onClick={() => refire(r)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--teal)',
                fontSize: 'var(--text-label)',
                padding: '0 2px',
                flexShrink: 0,
                textDecoration: 'underline',
              }}
            >
              re-fire
            </button>
          </div>
        ))
      )}
    </div>
  )
}
