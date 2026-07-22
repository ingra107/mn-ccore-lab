// SmartCompose — shared compose surface with @mention (MentionInput),
// emoji picker, file attach via R2 presigned URL flow, Cmd+Enter to post.
//
// Two modes:
//   1) **Task mode** (default): pass `taskId`. SmartCompose owns its
//      state and calls `usePostTaskUpdate(taskId)` on Cmd+Enter.
//      Used by TaskDetailDrawer, MyTasks InlineDetail/TaskDrawer.
//
//   2) **Custom mode**: pass `onSubmit` (and optionally `value` + `onChange`
//      to share state) plus `uploadContext` for R2 keying. SmartCompose
//      becomes a presentation primitive — caller owns submission.
//      Used by ProjectDetail compose (ActivityStream), MeetingDetail (notes + action items),
//      AskTheLab, TodayPage morning
//      thought, RightNow chat. (D14 — Phase A foundations.)
//
// Closes Phase 38 eval Issue 8 (compose toolbar @/:/📎 were decorative)
// and the audit-2026-04-28 D14 SmartCompose-universal sweep.
//
// Two surface variants:
//   - `theme="dark"` (default): renders inside dark portal chrome
//     (TodayPage / drawers). Hex-pinned dark colors.
//   - `theme="light"` (boxed=false default): renders inside the cream/ice
//     card shells used by ProjectDetail / MeetingDetail / AskTheLab.

import { useState, useRef, useCallback, useEffect } from 'react'
import { Paperclip, Smile, AtSign, Loader2, Send } from 'lucide-react'
import { MeLockToggle } from './ui/MeLockToggle'
import MentionInput from './MentionInput'
import HermesMark from './HermesMark'
import { usePostTaskUpdate } from '../hooks/useMutations'
import { useLaunchCommands, taskLaunchContext, type LaunchCommandContext } from '../hooks/useLaunchCommands'
import { isHermesPrefix, stripHermesPrefix } from '../lib/hermesRouting'
import { useUndoToast } from './UndoToast'
import { ICON_PROPS } from '../lib/iconProps'
import { withAlpha } from '../lib/taskGrouping'

const EMOJI_QUICK = ['👍', '❤️', '🎉', '👀', '🔥', '💡', '✅', '⚠️', '📝', '🤖', '🚀', '🙏']

const INK_DARK = '#e2e8f0'
const INK_DIM_DARK = '#7a828c'
const ACCENT_GOLD = '#c9a84c'
const ACCENT_TEAL = '#5cbcb4'

export type SmartComposeUploadContext = {
  /** Server-side context.type for /api/upload/url. */
  type: 'task' | 'project' | 'meeting' | 'question' | 'answer' | 'daily_thought' | 'note'
  /** Server-side context.id (e.g., task slug, project slug, meeting id). */
  id: string
  /** Optional: override the entityType used at /api/upload/done.
   *  Defaults to `type`. Some surfaces (e.g., daily_thought) won't have a
   *  matching attachments table — caller can pass a fallback like 'task'. */
  entityType?: string
}

interface BaseProps {
  placeholder?: string
  /** When true, the compose is wrapped with a labeled "Add note" header
   *  (UnifiedMyTasks drawer style). When false, just the textarea + toolbar
   *  (TodayPage drawer inline style). Only applies to dark theme. */
  boxed?: boolean
  /** 'dark' (default — TodayPage/drawer chrome) or 'light' (project/meeting/asktl). */
  theme?: 'dark' | 'light'
  /** Hide the wrapper margin/divider so caller controls spacing. */
  bare?: boolean
  /** rows for the textarea; default 2. */
  rows?: number
  /** Auto-focus the textarea on mount (e.g. when opening a chat slot). */
  autoFocus?: boolean
  /** Force the toolbar visible even when not focused/empty. */
  alwaysShowToolbar?: boolean
  /** Submit button label override; default "Post". */
  submitLabel?: string
  /** Posting label override; default "Posting…". */
  submittingLabel?: string
  /** Hide the ⌘⏎ kbd hint. */
  hideKbdHint?: boolean
  /** Hide the inline Post button (e.g., when the surrounding form supplies its own submit). */
  hideSubmitButton?: boolean
  /** Show the @me 🔒 private-note lock toggle. When the user enables it,
   *  "@me " is prepended to the content on submit (Rule 70: @me prefix
   *  → visibility='author'). Opt-in per-surface; off by default. */
  showMeLock?: boolean
  /** Show the Hermes ☿ toggle. When active, "@hermes " is prepended on
   *  submit, directing the note to the AI assistant. Mutually exclusive
   *  with the @me lock (you can't be private AND send to Hermes). */
  showHermesToggle?: boolean
  /** Project/task context that ENRICHES a @workon/@quickchat launch with the
   *  project folder, slug and task identity. Purely additive — whether the tag
   *  is intercepted at all no longer depends on it (see ownLaunchRouting). */
  launchContext?: LaunchCommandContext
  /** Opt OUT of the shared launch-tag interception because this surface routes
   *  the tags itself (MorningThoughtCompose owns @quickchat so it can apply its
   *  "send to home" originOverride).
   *
   *  Defaults to false — EVERY composer intercepts. Interception used to be
   *  opt-IN, keyed on `launchContext` being passed, and that silently broke the
   *  seed-isolation contract (useLaunchCommands.ts) at every surface nobody
   *  remembered to opt in: MentionInput advertises @workon/@quickchat in its
   *  dropdown UNCONDITIONALLY (KNOWN_COMMAND_TAGS) and even renders a "command
   *  recognized" badge, so a composer that shows the dropdown has already
   *  promised the user the tag works. Where it wasn't wired, a typed
   *  "@workon <seed>" fell straight through and posted the seed as a plain
   *  team-visible note — launching nothing, and leaking the exact text the
   *  seed-isolation rule exists to keep out of team activity.
   *
   *  ProjectDetail's quick-compose was patched as an INSTANCE on 2026-07-21;
   *  the ActivityStream note + comment composers were left broken, which is
   *  how it was hit again on 2026-07-22. Inverting the default fixes the class:
   *  a new composer now fails LOUD (a launch with no project folder toasts
   *  "No project folder set") instead of silently posting a command as prose. */
  ownLaunchRouting?: boolean
}

interface TaskModeProps extends BaseProps {
  taskId: string
  onSubmit?: never
  value?: never
  onChange?: never
  submitting?: never
  uploadContext?: SmartComposeUploadContext
}

interface CustomModeProps extends BaseProps {
  taskId?: undefined
  /** Custom submit. Receives raw textarea content (caller trims). */
  onSubmit: (content: string) => Promise<void> | void
  /** Optional controlled value. If omitted, SmartCompose owns state. */
  value?: string
  onChange?: (next: string) => void
  /** External pending state (e.g. mutation.isPending). */
  submitting?: boolean
  /** R2 upload context. Required to enable file attach in custom mode. */
  uploadContext?: SmartComposeUploadContext
}

type SmartComposeProps = TaskModeProps | CustomModeProps

export default function SmartCompose(props: SmartComposeProps) {
  const {
    placeholder = 'Add a note, or @hermes for AI…',
    boxed = false,
    theme = 'dark',
    bare = false,
    rows = 2,
    autoFocus = false,
    alwaysShowToolbar = false,
    submitLabel = 'Post',
    submittingLabel = 'Posting…',
    hideKbdHint = false,
    hideSubmitButton = false,
    showMeLock = false,
    showHermesToggle = false,
    launchContext,
    ownLaunchRouting = false,
  } = props

  const [meLocked, setMeLocked] = useState(false)
  const [hermesLocked, setHermesLocked] = useState(false)

  const isCustomMode = 'onSubmit' in props && typeof props.onSubmit === 'function'
  const taskMutation = usePostTaskUpdate(isCustomMode ? '' : (props as TaskModeProps).taskId)

  // State: caller-controlled in custom mode (if value/onChange provided), else owned here.
  const [internalVal, setInternalVal] = useState('')
  const isControlled = isCustomMode && typeof (props as CustomModeProps).value === 'string'
  const val = isControlled ? ((props as CustomModeProps).value as string) : internalVal
  const setVal = useCallback((next: string | ((cur: string) => string)) => {
    if (isControlled) {
      const onChange = (props as CustomModeProps).onChange
      if (!onChange) return
      const resolved = typeof next === 'function' ? (next as (cur: string) => string)(val) : next
      onChange(resolved)
    } else {
      setInternalVal((cur) => (typeof next === 'function' ? (next as (cur: string) => string)(cur) : next))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isControlled, val])

  const [focused, setFocused] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Instant optimistic preview while the real R2 upload runs (mirrors
  // BugReportModal's screenshot-preview UX — local base64 only, never
  // submitted/stored; the durable path is still the presigned-R2 flow below,
  // Path A). Cleared on success (real markdown link now in the textarea) or
  // failure (loud toast fires instead).
  const [pendingUploads, setPendingUploads] = useState<{ id: string; dataUrl: string; filename: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const undoToast = useUndoToast()
  const { tryLaunchCommand } = useLaunchCommands()

  useEffect(() => {
    // preventScroll: keeps focus without browser-scrolling the textarea into
    // view on in-page mounts (click-stays-put rule, #39 sweep, 2026-06-16).
    if (autoFocus && textareaRef.current) textareaRef.current.focus({ preventScroll: true })
  }, [autoFocus])

  const externalSubmitting = isCustomMode ? !!(props as CustomModeProps).submitting : taskMutation.isPending
  const submitting = externalSubmitting

  const showToolbar = alwaysShowToolbar || focused || val.length > 0 || emojiOpen

  // R2 upload context — task mode falls back to {type:'task', id: taskId}.
  const uploadContext: SmartComposeUploadContext | null = (() => {
    if (isCustomMode) return (props as CustomModeProps).uploadContext ?? null
    const t = (props as TaskModeProps).taskId
    return { type: 'task', id: t, entityType: 'task' }
  })()

  const insertAtCursor = useCallback((insertion: string) => {
    setVal((current) => {
      const ta = textareaRef.current
      const start = ta?.selectionStart ?? current.length
      const end = ta?.selectionEnd ?? current.length
      const next = current.slice(0, start) + insertion + current.slice(end)
      requestAnimationFrame(() => {
        if (!ta) return
        ta.focus()
        const pos = start + insertion.length
        ta.setSelectionRange(pos, pos)
      })
      return next
    })
  }, [setVal])

  const submit = useCallback(async () => {
    const raw = val.trim()
    if (!raw) return
    // @workon/@quickchat launch tags never post as comments (seed isolation —
    // see useLaunchCommands). EVERY mode intercepts by default; a surface that
    // routes the tags itself opts out via ownLaunchRouting. Runs on `raw`,
    // before the @hermes/@me lock prefixes, so a typed launch tag always wins.
    if (!ownLaunchRouting) {
      // Task mode always carries its own taskId into the launch context, so a
      // @workon/@quickchat fired from any task compose surface (Today drawer,
      // MyTasks InlineDetail) reaches the worker with task identity and the
      // surface can't forget it (#485). Custom mode uses the caller's
      // launchContext verbatim (a custom task surface may set taskId there).
      const ctx: LaunchCommandContext = isCustomMode
        ? (launchContext ?? {})
        : taskLaunchContext((props as TaskModeProps).taskId, launchContext ?? {})
      // setVal() already dispatches correctly for both modes (calls the
      // caller's onChange when controlled, else sets internal state) — no
      // `!isControlled` guard needed. Previously this only cleared
      // uncontrolled state, which was a no-op-equivalent bug hidden until
      // now: both prior launchContext consumers (InlineDetail, TaskDetailDrawer)
      // are task mode, which is NEVER controlled, so `!isControlled` was
      // always true for them. ProjectDetail (2026-07-21) is the first
      // controlled custom-mode + launchContext consumer — without this fix a
      // successful @workon/@quickchat launch would leave the seed text
      // sitting in the (controlled) compose box instead of clearing it.
      const routed = tryLaunchCommand(raw, ctx, () => setVal(''))
      if (routed) return
    }
    // ── @hermes prefix (task mode): real Hermes round-trip via /api/ai-requests ──
    // Converges task compose surfaces onto the transport TaskDetailPanel already
    // uses (#484 item 4): a typed "@hermes …" posts an ai_request keyed by the
    // task id — read back by TaskHermesReplies (#519) — instead of a plain
    // comment that only manual /process triage would answer. Runs AFTER the
    // launch-tag interception (so @workon/@quickchat still win) and only on the
    // PREFIX form; a mid-text @hermes ("ask @hermes about X") stays a comment.
    // The Hermes toggle's @hermes prepend is intentionally left as-is (still a
    // comment) — only a typed prefix routes here.
    if (!isCustomMode && isHermesPrefix(raw)) {
      const taskId = (props as TaskModeProps).taskId
      try {
        const res = await fetch('/api/ai-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_type: 'daily_thought', source_id: taskId, prompt: stripHermesPrefix(raw) }),
        })
        if (!res.ok) throw new Error(`/api/ai-requests ${res.status}`)
        setVal('')
        undoToast.showSuccess('Sent to Hermes')
      } catch (err) {
        console.error('@hermes from task compose failed:', err)
        undoToast.showError('@hermes failed — your message is still here, try again')
      }
      return
    }
    // Prepend prefix based on active lock (mutually exclusive: @hermes wins over @me).
    const content = showHermesToggle && hermesLocked && !raw.startsWith('@hermes ')
      ? `@hermes ${raw}`
      : showMeLock && meLocked && !raw.startsWith('@me ')
        ? `@me ${raw}`
        : raw
    if (isCustomMode) {
      const onSubmit = (props as CustomModeProps).onSubmit
      try {
        await onSubmit(content)
        // Clear when caller didn't control state. If controlled, it's the caller's
        // job to clear (in case they want to retry on error etc.).
        if (!isControlled) setVal('')
      } catch (err) {
        console.error('SmartCompose submit failed:', err)
      }
    } else {
      taskMutation.mutate({ content }, {
        onSuccess: () => {
          setVal('')
          undoToast.showSuccess('Note posted')
        },
      })
    }
  }, [val, showMeLock, meLocked, showHermesToggle, hermesLocked, isCustomMode, props, isControlled, setVal, taskMutation, undoToast, tryLaunchCommand, launchContext, ownLaunchRouting])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }, [submit])

  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !uploadContext) return
    const isImage = (file.type || '').startsWith('image/')
    const previewId = crypto.randomUUID()
    if (isImage) {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setPendingUploads((prev) => [...prev, { id: previewId, dataUrl, filename: file.name }])
      }
      reader.readAsDataURL(file)
    }
    setUploading(true)
    try {
      const urlRes = await fetch('/api/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          context: { type: uploadContext.type, id: uploadContext.id },
        }),
      })
      if (!urlRes.ok) throw new Error(`Failed to get upload URL (${urlRes.status}) — R2 may not be configured`)
      const urlData = await urlRes.json() as { data?: { uploadUrl: string; key: string } }
      if (!urlData.data?.uploadUrl) throw new Error('Failed to get upload URL — R2 may not be configured')
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
          entityType: uploadContext.entityType ?? uploadContext.type,
          entityId: uploadContext.id,
        }),
      })
      if (!doneRes.ok) throw new Error(`Recording attachment failed (${doneRes.status})`)
      const doneData = await doneRes.json() as { data?: { url?: string } }
      // Same-origin, non-expiring raw-bytes link (api/routes/uploads.ts
      // handleUploadDone) — falls back to constructing it client-side only if
      // an older/unpatched worker is still serving the response.
      const url = doneData.data?.url ?? `/api/files/${urlData.data.key}/raw`
      insertAtCursor(isImage ? `![${file.name}](${url}) ` : `[${file.name}](${url}) `)
      undoToast.showSuccess(`Attached ${file.name}`)
    } catch (err) {
      console.error('Attach failed:', err)
      undoToast.showError(`Attach failed: ${err instanceof Error ? err.message : 'please try again.'}`)
    } finally {
      setUploading(false)
      setPendingUploads((prev) => prev.filter((p) => p.id !== previewId))
    }
  }, [uploadContext, insertAtCursor, undoToast])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!uploadContext) return
    const items = Array.from(e.clipboardData?.items || [])
    const fileItem = items.find((it) => it.kind === 'file')
    if (fileItem) {
      e.preventDefault()
      const f = fileItem.getAsFile()
      if (f) {
        const dt = new DataTransfer()
        dt.items.add(f)
        handleFiles(dt.files)
      }
    }
  }, [uploadContext, handleFiles])

  const isDark = theme === 'dark'

  // Themed styles ------------------------------------------------
  const textareaStyle: React.CSSProperties = isDark
    ? {
        width: '100%',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 10px',
        color: INK_DARK,
        fontSize: 12,
        fontFamily: 'inherit',
        outline: 'none',
        resize: 'vertical',
      }
    : {
        width: '100%',
        background: 'var(--cream)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 10px',
        color: 'var(--ink)',
        fontSize: 13,
        fontFamily: 'inherit',
        outline: 'none',
        resize: 'vertical',
        lineHeight: 1.4,
      }

  const submitBg = isDark ? ACCENT_GOLD : 'var(--teal-solid)'
  const submitColor = isDark ? '#0b1017' : 'var(--ink-bright, #fff)'

  const inner = (
    <>
      <MentionInput
        value={val}
        onChange={setVal}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 100) /* let buttons handle clicks first */}
        rows={rows}
        style={textareaStyle}
      />
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
      />
      {/* Pending-upload thumbnail strip: instant optimistic preview */}
      {pendingUploads.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {pendingUploads.map((p) => (
            <div
              key={p.id}
              style={{ position: 'relative', flexShrink: 0, width: 40, height: 40, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid var(--border-subtle)' }}
            >
              <img src={p.dataUrl} alt={p.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label={`Uploading ${p.filename}`}
                title={`Uploading ${p.filename}…`}
              >
                <Loader2 size={12} strokeWidth={2} absoluteStrokeWidth className="animate-spin" style={{ color: '#fff' }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Slack-style action row — below the textarea, left = quiet icon-buttons, right = Post */}
      {showToolbar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, position: 'relative' }}>
          {/* Attach */}
          {uploadContext && (
            <ToolbarBtn theme={theme} label="Attach file" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 {...ICON_PROPS} size={11} className="animate-spin" /> : <Paperclip size={11} strokeWidth={1.5} absoluteStrokeWidth />}
            </ToolbarBtn>
          )}
          {/* @mention */}
          <ToolbarBtn theme={theme} label="Mention someone" onClick={() => insertAtCursor('@')}><AtSign size={11} strokeWidth={1.5} absoluteStrokeWidth /></ToolbarBtn>
          {/* Emoji */}
          <ToolbarBtn theme={theme} label="Add emoji" onClick={() => setEmojiOpen((o) => !o)} active={emojiOpen}><Smile size={11} strokeWidth={1.5} absoluteStrokeWidth /></ToolbarBtn>
          {/* @me lock — ROW 81: shared MeLockToggle (unified with TaskDetailPanel) */}
          {showMeLock && (
            <MeLockToggle
              locked={meLocked}
              onToggle={() => {
                setMeLocked((l) => {
                  if (!l) setHermesLocked(false)
                  return !l
                })
              }}
              theme={theme}
            />
          )}
          {/* Queue-for-Claude toggle — queues this note to dispatch_queue for
              Nick's next Claude Code session on submit. Distinct from a typed
              @hermes prefix (real-time, handled by isHermesPrefix above) — #520. */}
          {showHermesToggle && (
            <button
              type="button"
              role="switch"
              aria-checked={hermesLocked ? "true" : "false"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setHermesLocked((h) => {
                  if (!h) setMeLocked(false)
                  return !h
                })
              }}
              title={hermesLocked ? 'Queued for Claude — click to send as a public note instead' : 'Click to queue this note for your next Claude Code session'}
              aria-label={hermesLocked ? 'Queue-for-Claude mode on — note will be queued, not posted' : 'Queue-for-Claude mode off — click to queue this note instead of posting it'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                height: 22,
                padding: '0 6px', borderRadius: 'var(--radius-sm)',
                border: hermesLocked
                  ? `1px solid ${isDark ? 'rgba(220,179,85,0.55)' : 'rgba(107,84,32,0.35)'}`
                  : `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'var(--border-subtle)'}`,
                background: hermesLocked
                  ? (isDark ? 'rgba(220,179,85,0.12)' : 'rgba(107,84,32,0.10)')
                  : 'transparent',
                color: hermesLocked
                  ? (isDark ? '#dcb355' : 'var(--gold)')
                  : (isDark ? INK_DIM_DARK : 'var(--slate)'),
                fontSize: 10,
                fontWeight: hermesLocked ? 600 : 400,
                opacity: hermesLocked ? 1 : 0.70,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <HermesMark size={11} color={hermesLocked ? (isDark ? '#dcb355' : 'var(--gold)') : 'currentColor'} />
              Queue for Claude
            </button>
          )}
          {/* Emoji picker — opens above the toolbar */}
          {emojiOpen && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 6,
              padding: 6,
              background: isDark ? '#0f1923' : 'var(--cream)',
              border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              gap: 2,
              zIndex: 20,
              boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.4)' : 'var(--shadow-menu)',
            }}>
              {EMOJI_QUICK.map((e) => (
                <button
                  key={e}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => { insertAtCursor(e); setEmojiOpen(false) }}
                  style={{ width: 24, height: 24, fontSize: 15, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 3 }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.08)' : 'var(--gold-active)' }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}
                >{e}</button>
              ))}
            </div>
          )}
          {/* Spacer */}
          <span style={{ flex: 1 }} />
          {/* ⌘⏎ hint */}
          {!hideKbdHint && val.trim().length > 0 && (
            <kbd style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: 9,
              padding: '1px 4px',
              border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--border-subtle)',
              borderRadius: 2,
              color: isDark ? INK_DIM_DARK : 'var(--muted)',
            }}>⌘⏎</kbd>
          )}
          {/* Post button */}
          {!hideSubmitButton && val.trim().length > 0 && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              aria-label={submitting ? submittingLabel : submitLabel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: isDark ? '3px 10px' : '4px 12px',
                fontSize: 11,
                background: submitBg,
                color: submitColor,
                border: 'none',
                borderRadius: isDark ? 3 : 'var(--radius-sm)',
                cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              <Send size={10} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              {submitting ? submittingLabel : submitLabel}
            </button>
          )}
        </div>
      )}
    </>
  )

  // Hidden paste handler — registers on the textarea via MentionInput
  // doesn't expose paste; attach via a wrapper so paste-image works.
  const composeWrapper = (
    <div onPaste={handlePaste as unknown as React.ClipboardEventHandler<HTMLDivElement>}>
      {inner}
    </div>
  )

  if (bare) return composeWrapper

  if (isDark && boxed) {
    return (
      <div style={{ marginTop: 18, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM_DARK, marginBottom: 6 }}>Add note</div>
        {composeWrapper}
      </div>
    )
  }

  if (isDark) {
    return (
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
        {composeWrapper}
      </div>
    )
  }

  // Light theme — flush wrapper, caller controls spacing via `bare` or wrapping.
  return composeWrapper
}

function ToolbarBtn({ children, onClick, label, active, disabled, theme }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean; disabled?: boolean; theme?: 'dark' | 'light' }) {
  const isDark = theme !== 'light'
  const baseColor = isDark ? INK_DIM_DARK : 'var(--slate)'
  const activeColor = isDark ? ACCENT_TEAL : 'var(--teal)'
  const baseBorder = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--border-subtle)'
  const activeBorder = isDark ? `1px solid ${withAlpha(ACCENT_TEAL, 30)}` : '1px solid var(--teal)'
  const activeBg = isDark ? withAlpha(ACCENT_TEAL, 15) : 'var(--teal-active)'
  // N5 — CSS hover via the hov-* utilities. The old !active guard is moot:
  // hover color/border equal the active values, so hovering an active button
  // is a visual no-op either way.
  return (
    <button
      type="button"
      className="hov-color hov-border"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 'var(--radius-sm)',
        background: active ? activeBg : 'transparent',
        border: active ? activeBorder : baseBorder,
        color: active ? activeColor : baseColor,
        fontSize: 11,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        '--hov-color': activeColor,
        '--hov-border': isDark ? withAlpha(ACCENT_TEAL, 30) : 'var(--teal)',
      } as React.CSSProperties}
    >{children}</button>
  )
}
