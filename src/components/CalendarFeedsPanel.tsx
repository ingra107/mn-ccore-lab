// CalendarFeedsPanel — UI for managing the user's iCal feed integrations.
// Renders in two surfaces:
//   - Settings → Integrations tab (admin-style overview)
//   - Profile page (primary entry, contextual to "this is my profile")
// Shares one TanStack Query cache key (`calendar-feeds`) so add/remove
// in either surface updates the other instantly.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar as CalendarIcon, Info, X } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'
import { withAlpha } from '../lib/taskGrouping'

interface CalendarFeed {
  id: string
  label: string
  urlPreview: string
  lastPolledAt: string | null
  lastError: string | null
  createdAt: string
}

// Input edge: --field-edge, the one input outline (design-system "Modal + form field").
const FEED_INPUT_STYLE = {
  border: '1px solid var(--field-edge)',
  color: 'var(--ink)',
  background: 'var(--field-bg)',
} as const

export default function CalendarFeedsPanel() {
  const queryClient = useQueryClient()
  const { data: feeds = [] } = useQuery({
    queryKey: ['calendar-feeds'],
    queryFn: async () => {
      const res = await fetch('/api/integrations/calendar/feeds')
      if (!res.ok) return [] as CalendarFeed[]
      const j = await res.json() as { feeds: CalendarFeed[] }
      return j.feeds
    },
    staleTime: 30 * 1000,
  })

  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [submitErr, setSubmitErr] = useState<string | null>(null)

  const addFeed = useMutation({
    mutationFn: async (input: { url: string; label: string }) => {
      const res = await fetch('/api/integrations/calendar/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => {
      setUrl(''); setLabel(''); setSubmitErr(null)
      queryClient.invalidateQueries({ queryKey: ['calendar-feeds'] })
    },
    onError: (e: Error) => setSubmitErr(e.message),
  })

  const removeFeed = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations/calendar/feeds/${id}/delete`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['calendar-feeds'] }),
  })

  return (
    <div className="flex flex-col gap-4">
      {feeds.length > 0 && (
        <div className="flex flex-col gap-2">
          {feeds.map((f) => (
            <CalendarFeedRow key={f.id} feed={f} onRemove={() => removeFeed.mutate(f.id)} />
          ))}
        </div>
      )}

      <div
        className="sk-mat flex flex-col gap-2 p-3 rounded-lg"
      >
        <div className="flex items-center gap-2">
          <CalendarIcon {...ICON_PROPS} size={14} style={{ color: 'var(--sk-t2)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Add a calendar feed</span>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.75, lineHeight: 1.5 }}>
          Google: Settings → Integrate calendar → <em>Secret address in iCal format</em>.{' '}
          iCloud: share calendar → <em>Public Calendar</em>.{' '}
          Outlook: publish calendar → ICS link.{' '}
          Read-only. Polled every ~15 min.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            placeholder="https://calendar.google.com/calendar/ical/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-md px-2 py-1.5 text-xs outline-none"
            style={FEED_INPUT_STYLE}
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-32 rounded-md px-2 py-1.5 text-xs outline-none"
            style={FEED_INPUT_STYLE}
          />
          <button
            type="button"
            onClick={() => { if (url.trim()) addFeed.mutate({ url, label }) }}
            disabled={addFeed.isPending || !url.trim()}
            className="tk-btn tk-pri justify-center"
            style={{
              cursor: addFeed.isPending || !url.trim() ? 'not-allowed' : 'pointer',
              opacity: addFeed.isPending || !url.trim() ? 0.5 : 1,
            }}
          >
            {addFeed.isPending ? 'Adding…' : 'Add feed'}
          </button>
        </div>
        {submitErr && (
          <p className="text-[11px]" style={{ color: 'var(--job-danger)', lineHeight: 1.4 }}>{submitErr}</p>
        )}
      </div>

      <div className="flex items-start gap-2 px-1">
        <Info {...ICON_PROPS} size={12} style={{ color: 'var(--sk-t2)', marginTop: 2, flexShrink: 0 }} />
        <p className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75, lineHeight: 1.5 }}>
          The URL is the secret — anyone with it can read the calendar. Hub stores it in D1
          and never re-displays it after save (you'll see a host preview instead). Remove a feed any time above.
        </p>
      </div>
    </div>
  )
}

function CalendarFeedRow({ feed, onRemove }: { feed: CalendarFeed; onRemove: () => void }) {
  const lastPolled = feed.lastPolledAt
    ? new Date(feed.lastPolledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'never'
  return (
    <div
      className="sk-mat flex items-start gap-3 p-3 rounded-lg"
    >
      <div
        className="flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0"
        style={{ background: 'color-mix(in srgb, var(--job-accent) 10%, transparent)' }}
      >
        <CalendarIcon {...ICON_PROPS} size={16} style={{ color: 'var(--sk-t2)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{feed.label}</span>
          {feed.lastError ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: withAlpha('var(--job-danger)', 12), color: 'var(--job-danger)' }}>
              error
            </span>
          ) : feed.lastPolledAt ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--sk-t1) 5%, transparent)', color: 'var(--sk-t2)' }}>
              connected
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--slate)' }}>
              pending
            </span>
          )}
        </div>
        <p className="text-[11px] truncate" style={{ color: 'var(--slate)', opacity: 0.75, lineHeight: 1.5 }} title={feed.urlPreview}>
          {feed.urlPreview}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--slate)', opacity: 0.6 }}>
          {feed.lastError ? `Last error: ${feed.lastError}` : `Last poll: ${lastPolled}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove feed"
        className="tk-btn tk-sm"
      >
        <X {...ICON_PROPS} size={12} /> Remove
      </button>
    </div>
  )
}
