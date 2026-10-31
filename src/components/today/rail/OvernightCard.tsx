// OvernightCard -- Nick-only: what PB changed since last evening, with Undo.
//
// The morning change receipt (PB Context/Decisions/2026-10-30-receipts-and-
// headless-process.md, ruling 4). The Hub writes every change line in the batch
// of the write itself; this card reads them (GET /api/receipts/overnight) and
// answers the three things Nick can do with one: look, Undo, mark Seen.
//
// Header: the number of changes is the hero, then the lanes, then failures and
// items left for him when there are any. Each run is one collapsed row (lane,
// machine, time, state, counts); a row opens in place to its lines, and "Load
// more" pulls the rest of a long run. Failure and left-for-you lines are set
// apart by color job, not by a second look.
//
// An empty window says "Nothing changed overnight". A failed fetch says it
// could not load; it never passes for empty. A 403 (any viewer but Nick)
// resolves to null and the card renders nothing.
//
// Window start: the previous 18:00 America/Chicago (lib/overnightWindow.ts).
// Seen is the server's, per line, so it holds across devices.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import { FilterLinks } from '../../ui/FilterLinks'
import { PATHS } from '../../../constants/paths'
import {
  useOvernight, undoLine, postSeen, fetchRunLines, OVERNIGHT_KEY,
  type OvernightLine, type OvernightRun,
} from '../../../hooks/useOvernight'
import { overnightSince } from '../../../lib/overnightWindow'

const ALL = '__all__'

const KIND_TAG: Record<string, { label: string; color: string } | undefined> = {
  failure: { label: 'Failed', color: 'var(--job-danger)' },
  left_for_nick: { label: 'For you', color: 'var(--job-wants)' },
}

const STATE_LABEL: Record<OvernightRun['state'], string> = { open: 'Running', ok: 'Done', failed: 'Failed' }

function clock(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "3 changes · 1 failed · 1 for you · 1 undone", zero parts left out. */
function countsText(c: OvernightRun['counts']): string {
  return [
    plural(c.change, 'change', 'changes'),
    c.failure ? `${c.failure} failed` : '',
    c.left_for_nick ? `${c.left_for_nick} for you` : '',
    c.undone ? `${c.undone} undone` : '',
  ].filter(Boolean).join(' · ')
}

function EntityLink({ line }: { line: OvernightLine }) {
  if (!line.entity_id) return null
  if (line.entity_type === 'tasks') {
    return <Link to={`${PATHS.myTasks}?open=${line.entity_id}`} style={{ fontSize: 11, color: 'var(--job-accent)' }}>Open task</Link>
  }
  if (line.entity_type === 'projects') {
    return <Link to={PATHS.project(line.entity_id)} style={{ fontSize: 11, color: 'var(--job-accent)' }}>Open project</Link>
  }
  return null
}

function LineRow({ line, undone, onUndone }: { line: OvernightLine; undone: boolean; onUndone: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const tag = KIND_TAG[line.kind]
  const isUndone = undone || !!line.undone_at

  async function undo() {
    setBusy(true)
    setRefusal(null)
    const r = await undoLine(line.id)
    setBusy(false)
    if (r.ok) {
      onUndone(line.id)
    } else if (r.code === 'changed_since') {
      setRefusal('Changed since, undo by hand')
    } else if (r.code === 'not_reversible') {
      setRefusal(line.inverse_reason ?? r.message)
    } else if (r.code === 'already_undone') {
      onUndone(line.id)
    } else {
      setRefusal(r.message)
    }
    queryClient.invalidateQueries({ queryKey: OVERNIGHT_KEY })
  }

  return (
    <div className="tk-rli" data-testid={`overnight-line-${line.id}`} data-kind={line.kind} data-unseen={line.seen ? undefined : 'true'}
      style={{ alignItems: 'flex-start', gap: 6 }}>
      <span
        aria-label={line.seen ? undefined : 'New'}
        data-testid={line.seen ? undefined : 'overnight-unseen-dot'}
        style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: line.seen ? 'transparent' : 'var(--job-accent)' }}
      />
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'normal', color: isUndone ? 'var(--sk-t3)' : 'inherit' }}>
        {tag && <span style={{ color: tag.color, fontWeight: 500, marginRight: 6 }}>{tag.label}</span>}
        <span style={isUndone ? { textDecoration: 'line-through' } : undefined}>{line.summary}</span>
        <span style={{ display: 'block' }}><EntityLink line={line} /></span>
        {refusal && <span role="status" data-testid="overnight-refusal" style={{ display: 'block', fontSize: 11, color: 'var(--sk-t3)' }}>{refusal}</span>}
      </span>
      {isUndone ? (
        <span className="tk-d" style={{ flexShrink: 0 }}>Undone</span>
      ) : line.undoable && !refusal ? (
        <button type="button" className="tk-more" style={{ marginLeft: 0 }} disabled={busy} onClick={undo} aria-label={`Undo: ${line.summary}`}>
          Undo
        </button>
      ) : null}
    </div>
  )
}

function RunRow({ run, undoneIds, onUndone }: { run: OvernightRun; undoneIds: Set<string>; onUndone: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState<OvernightLine[]>([])
  const [after, setAfter] = useState<string | null>(run.more_lines ? run.next_after : null)
  const [loadFailed, setLoadFailed] = useState(false)
  const stateTone = run.state === 'failed' ? 'var(--job-danger)' : 'var(--sk-t3)'

  // Lines the run's own page already carries win over a loaded copy.
  const have = new Set(run.lines.map((l) => l.id))
  const lines = [...run.lines, ...extra.filter((l) => !have.has(l.id))]

  async function loadMore() {
    if (!after) return
    setLoadFailed(false)
    try {
      const page = await fetchRunLines(run.run_id, after)
      setExtra((e) => [...e, ...page.lines])
      setAfter(page.next_after)
    } catch {
      setLoadFailed(true)
    }
  }

  return (
    <div data-testid={`overnight-run-${run.run_id}`} data-state={run.state}>
      <button
        type="button"
        className="tk-rli"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', background: 'none', border: 0, padding: '4px 0', textAlign: 'left', cursor: 'pointer', alignItems: 'center' }}
      >
        <span className="tk-t" style={{ flex: 1 }}>
          {run.counts.unseen > 0 && <span aria-label="New" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--job-accent)', marginRight: 6 }} />}
          <strong style={{ fontWeight: 600 }}>{run.lane}</strong>
          <span style={{ color: 'var(--sk-t3)' }}> · {run.machine} · {clock(run.started_at)}</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--sk-t3)' }}>{countsText(run.counts)}</span>
        </span>
        <span className="tk-d" style={{ color: stateTone }}>{STATE_LABEL[run.state]}</span>
        <CollapseChevron open={open} />
      </button>
      {open && (
        <div style={{ paddingLeft: 12 }}>
          {lines.map((l) => <LineRow key={l.id} line={l} undone={undoneIds.has(l.id)} onUndone={onUndone} />)}
          {after && (
            <button type="button" className="tk-more" style={{ margin: '2px 0 4px' }} onClick={loadMore}>Load more</button>
          )}
          {loadFailed && <span style={{ fontSize: 11, color: 'var(--sk-t3)', marginLeft: 8 }}>Couldn&apos;t load more</span>}
        </div>
      )}
    </div>
  )
}

export function OvernightCard({ isNick, now }: { isNick: boolean; now?: Date }) {
  const [open, setOpen] = useState(true)
  const [lane, setLane] = useState<string>(ALL)
  const [undoneIds, setUndoneIds] = useState<Set<string>>(() => new Set())
  // Read once at mount: tapping Seen must not move the window under his hand.
  const [since] = useState(() => overnightSince(now))
  const queryClient = useQueryClient()
  const { data, isError, isPending, refetch } = useOvernight(since, lane === ALL ? null : lane, isNick)
  const [seenBusy, setSeenBusy] = useState(false)

  if (!isNick) return null
  if (isPending) return null
  // A 403 resolves to null: not Nick, nothing to draw.
  if (!isError && data === null) return null

  if (isError) {
    return (
      <section className="tk-panel" data-testid="overnight-card" data-b2-overnight>
        <div style={{ fontSize: 11.5, color: 'var(--sk-t3)' }}>
          Couldn&apos;t load overnight changes{' '}
          <button type="button" className="tk-more" style={{ marginLeft: 4 }} onClick={() => refetch()}>Retry</button>
        </div>
      </section>
    )
  }

  const runs = data?.runs ?? []
  const lanes = data?.lanes ?? []
  const changes = lanes.reduce((n, l) => n + l.changes, 0)
  const failures = lanes.reduce((n, l) => n + l.failures, 0)
  const forYou = lanes.reduce((n, l) => n + l.left_for_nick, 0)
  const unseen = lanes.reduce((n, l) => n + l.unseen_lines, 0)

  if (lanes.length === 0 && runs.length === 0) {
    return (
      <section className="tk-panel" data-testid="overnight-card" data-b2-overnight>
        <div data-testid="overnight-empty" style={{ fontSize: 11.5, color: 'var(--sk-t3)' }}>Nothing changed overnight</div>
      </section>
    )
  }

  async function markSeen() {
    // The newest line created_at among the loaded runs; the Hub marks every
    // line up to it seen and a later line shows as new.
    const stamps = runs.flatMap((r) => r.lines.map((l) => l.created_at))
    if (!stamps.length) return
    const until = stamps.reduce((a, b) => (a > b ? a : b))
    setSeenBusy(true)
    try {
      await postSeen(until)
      await queryClient.invalidateQueries({ queryKey: OVERNIGHT_KEY })
    } catch {
      // The button stays; nothing was marked.
    } finally {
      setSeenBusy(false)
    }
  }

  const laneNames = lanes.map((l) => l.lane)
  const headLine = [
    laneNames.length ? laneNames.join(', ') : '',
    failures ? `${failures} failed` : '',
    forYou ? `${forYou} for you` : '',
  ].filter(Boolean).join(' · ')

  return (
    <section className="tk-panel" data-testid="overnight-card" data-b2-overnight>
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Overnight')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Overnight</h3>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span className="tk-fm" data-testid="overnight-changes">{changes}</span>
        <span style={{ fontSize: 12, color: 'var(--sk-t3)' }}>{changes === 1 ? 'change' : 'changes'}</span>
        <span data-testid="overnight-head" style={{ fontSize: 11.5, color: failures ? 'var(--job-danger)' : 'var(--sk-t3)' }}>{headLine}</span>
        {unseen > 0 && (
          <button type="button" className="tk-more" disabled={seenBusy} onClick={markSeen}>Seen</button>
        )}
      </div>
      {open && (
        <>
          {lanes.length > 1 && (
            <FilterLinks
              ariaLabel="Overnight lane"
              value={lane}
              onChange={(v) => setLane(v)}
              options={[{ value: ALL, label: 'All' }, ...lanes.map((l) => ({ value: l.lane, label: l.lane, count: l.changes }))]}
            />
          )}
          {runs.length === 0 && (
            <div data-testid="overnight-empty" style={{ fontSize: 11.5, color: 'var(--sk-t3)' }}>Nothing changed overnight</div>
          )}
          {runs.map((r) => (
            <RunRow key={r.run_id} run={r} undoneIds={undoneIds} onUndone={(id) => setUndoneIds((s) => new Set(s).add(id))} />
          ))}
        </>
      )}
    </section>
  )
}
