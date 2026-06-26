// MorningThoughtCompose — TP-01 (D11 prefix-routed + time-aware morning input).
//
// Replaces the bare decorative <input> at TodayPage.tsx with a real submit
// handler. Routing rules per audit decision D11:
//
//   `@quickchat <text>` → POST /api/launch-log (origin-aware Claude Code launch)
//   `@hermes <text>`    → POST /api/ai-requests with source_type='daily_thought'
//   `@backlog[: ]<txt>` → POST /api/ai-requests with source_type='backlog_idea'
//   `note: <text>`      → POST /api/inbox-events (durable) + LS echo for instant UX
//   default             → useCreateTask({assignee, group_override}) — creates
//                         a task in the user's default bucket (priorities)
//
// Time-aware (after 5pm CT — local hour >= 17):
//   - placeholder swaps to "Plan tomorrow's first move…"
//   - default tasks get due_date = tomorrow
//
// The brief says to use SmartCompose; we do — `theme="dark"` + `bare` so the
// existing PANEL_BG container styling on TodayPage stays intact.

import { useCallback, useMemo, useState } from 'react'
import SmartCompose from '../SmartCompose'
import { useAuth } from '../../hooks/useAuth'
import { emailToSlug } from '../../lib/emailSlug'
import { useCreateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { todayKey } from './constants'
import { nowInstant } from '../../lib/time'
import { useIsMobile } from '../../hooks/useIsMobile'
import { localDateKey } from '../../lib/dateUtils'
import { detectOrigin } from '../../lib/launchOrigin'
import { buildLaunchUri } from '../../lib/launch'
import { useProtocolLaunch } from '../../hooks/useProtocolLaunch'

const DEFAULT_GROUP_OVERRIDE = 'priorities'

function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localDateKey(d)
}

function appendDailyThought(content: string, kind: 'note' | 'hermes' | 'task') {
  if (typeof window === 'undefined') return
  const key = `today_state_${todayKey()}`
  try {
    const raw = window.localStorage.getItem(key)
    const state = raw ? JSON.parse(raw) : {}
    const thoughts = Array.isArray(state.thoughts) ? state.thoughts : []
    thoughts.push({ at: nowInstant(), kind, content })
    state.thoughts = thoughts
    window.localStorage.setItem(key, JSON.stringify(state))
  } catch { /* ignore */ }
}

export function MorningThoughtCompose() {
  const { user } = useAuth()
  const userSlug = emailToSlug(user?.email)
  const createTask = useCreateTask()
  const undoToast = useUndoToast()
  const { launch: protocolLaunch } = useProtocolLaunch()
  const [forceHome, setForceHome] = useState(false)

  // Compute "after 5pm" once per render — reasonable for the mount lifetime
  // of this surface. Page is a daily landing; user reloads if they cross 5pm.
  const isEvening = useMemo(() => new Date().getHours() >= 17, [])
  // N1.21 — short strings on phones: the long placeholder clipped mid-
  // sentence in the narrow composer.
  const isPhone = useIsMobile(768)
  const placeholder = isPhone
    ? (isEvening ? "Plan tomorrow's first move…" : 'Quick capture or @hermes…')
    : isEvening
      ? "Plan tomorrow's first move, or @hermes to delegate…"
      : 'Morning thought, quick capture, or @hermes to delegate…'

  const handleSubmit = useCallback(async (raw: string) => {
    const content = raw.trim()
    if (!content) return

    // Route 0 — @quickchat: launch a seeded Claude Code session (origin-aware).
    if (/^@quickchat\b/i.test(content)) {
      const seed = content.replace(/^@quickchat\s*/i, '').trim()
      const origin = forceHome ? 'mobile' : detectOrigin()
      try {
        const res = await fetch('/api/launch-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: 'quickchat', seed, origin }),
        })
        if (!res.ok) throw new Error(`/api/launch-log ${res.status}`)
        const { data } = await res.json() as { data: { id: string } }
        if (origin === 'computer') {
          await protocolLaunch(buildLaunchUri(data.id), {
            copyText: seed,
            successMessage: 'Launching Quick Chat on this machine…',
            copyMessage: 'Launching Quick Chat… (seed copied as backup)',
          })
        } else {
          undoToast.showInfo('Saved to your launch log — mobile launch goes live in Phase 2')
        }
        appendDailyThought(content, 'task')
      } catch (err) {
        console.error('@quickchat launch failed:', err)
        undoToast.showError(`@quickchat failed: ${err instanceof Error ? err.message : 'try again'}`)
      }
      return
    }

    // Route 0.5 — @workon: no task/project context in the Today bar.
    // Seed-isolation guard: intercept before the default task-creation
    // path so a seed-shaped string cannot post as a team-visible task.
    // The right surface is a task comment box (OverviewQuickAdd).
    if (/^@workon\b/i.test(content)) {
      undoToast.showInfo('@workon needs a task — open a task and type @workon there')
      return
    }

    // Route 1 — @hermes prefix
    if (/^@hermes\b/i.test(content)) {
      const prompt = content.replace(/^@hermes\s*/i, '').trim() || content
      try {
        const res = await fetch('/api/ai-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_type: 'daily_thought',
            source_id: todayKey(),
            prompt,
          }),
        })
        if (!res.ok) throw new Error(`/api/ai-requests ${res.status}`)
        appendDailyThought(content, 'hermes')
        undoToast.showSuccess('Sent to Hermes')
      } catch (err) {
        console.error('Morning thought → Hermes failed:', err)
        undoToast.showError(`Sending to Hermes failed: ${err instanceof Error ? err.message : 'please try again.'}`)
      }
      return
    }

    // Route 2 — @backlog[: ] prefix → improvement backlog via ai-requests
    if (/^@backlog\b[:]?/i.test(content)) {
      const idea = content.replace(/^@backlog[:]?\s*/i, '').trim() || content
      try {
        const res = await fetch('/api/ai-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_type: 'backlog_idea',
            source_id: todayKey(),
            prompt: idea,
          }),
        })
        if (!res.ok) throw new Error(`/api/ai-requests ${res.status}`)
        appendDailyThought(content, 'hermes')
        undoToast.showSuccess('Sent to improvement backlog')
      } catch (err) {
        console.error('Morning thought → backlog failed:', err)
        undoToast.showError(`Sending to backlog failed: ${err instanceof Error ? err.message : 'please try again.'}`)
      }
      return
    }

    // Route 3 — note: prefix (durable: POST to inbox-events + LS echo for instant UX)
    if (/^note:\s*/i.test(content)) {
      const text = content.replace(/^note:\s*/i, '').trim()
      if (!text) return
      // Instant UX echo — visible before the network round-trip completes
      appendDailyThought(text, 'note')
      try {
        const res = await fetch('/api/inbox-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: text, source: 'hub_ui' }),
        })
        if (!res.ok) throw new Error(`/api/inbox-events ${res.status}`)
        undoToast.showSuccess('Saved to today\'s thoughts')
      } catch (err) {
        console.error('Morning thought → note failed:', err)
        undoToast.showError(`Note save failed: ${err instanceof Error ? err.message : 'please try again.'}`)
      }
      return
    }

    // Route 4 — default: create a task in the user's default group.
    if (!userSlug) {
      undoToast.showInfo('Sign in to capture tasks.')
      return
    }
    const due_date = isEvening ? tomorrowISO() : undefined
    return new Promise<void>((resolve) => {
      createTask.mutate({
        title: content,
        description: content,
        assignee: userSlug,
        ...(due_date ? { due_date } : {}),
        // useCreateTask's input type doesn't yet enumerate group_override —
        // pass it via spread so the backend (which accepts it via VALID_GROUP_OVERRIDES)
        // captures it. If the type guard rejects, falls through harmless.
        // (Hub-side createTask wraps fetchApi; group_override is a top-level
        // body field on POST /api/tasks per CLAUDE.md Rule 63.)
        // @ts-expect-error — group_override not in TS input but accepted by API
        group_override: DEFAULT_GROUP_OVERRIDE,
      }, {
        onSuccess: () => {
          appendDailyThought(content, 'task')
          undoToast.showSuccess(isEvening ? 'Tomorrow task captured' : 'Task captured')
          resolve()
        },
        onError: (err: unknown) => {
          console.error('Morning thought → task failed:', err)
          resolve() // resolve anyway so SmartCompose clears its UI lock
        },
      })
    })
  }, [userSlug, isEvening, createTask, undoToast, protocolLaunch, forceHome])

  return (
    <>
      <SmartCompose
        placeholder={placeholder}
        theme="dark"
        bare
        rows={1}
        submitLabel="Capture"
        submittingLabel="Capturing…"
        onSubmit={handleSubmit}
        submitting={createTask.isPending}
        uploadContext={{ type: 'daily_thought', id: todayKey(), entityType: 'task' }}
      />
      <label className="flex items-center gap-1.5 justify-end text-xs text-neutral-400 cursor-pointer select-none mt-1">
        <input
          type="checkbox"
          checked={forceHome}
          onChange={e => setForceHome(e.target.checked)}
          className="accent-violet-400"
        />
        send to home
      </label>
    </>
  )
}
