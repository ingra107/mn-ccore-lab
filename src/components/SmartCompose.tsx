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
// One look, read from page tokens (--cream, --border-subtle, --ink, --slate,
// --teal), so it follows the page into light or dark mode. There used to be a
// second, default `theme="dark"` that hex-pinned pale ink on a 2% white fill:
// on a light page the field had no visible edge and its placeholder all but
// vanished (an input must look like an input, UI principle 20). Callers had to
// remember `theme="light"` to get a working field, and the four that forgot
// (Today task + milestone drawers, MyTasks inline detail, thread replies)
// shipped the broken one. The prop is gone, so no caller can pick it again.
// `boxed` and `bare` went with it: both only changed the dark wrapper, so the
// box now always renders flush and the caller owns spacing.

import { useState, useRef, useCallback, useEffect } from 'react'
import { Paperclip, Smile, AtSign, Loader2, Send } from 'lucide-react'
import { MeLockToggle } from './ui/MeLockToggle'
import MentionInput, { CommandBadge } from './MentionInput'
import HermesMark from './HermesMark'
import { useQueryClient } from '@tanstack/react-query'
import { usePostTaskUpdate } from '../hooks/useMutations'
import { useLaunchCommands, taskLaunchContext, type LaunchCommandContext } from '../hooks/useLaunchCommands'
import { isHermesPrefix } from '../lib/hermesRouting'
import { askHermesOnTask, hermesOutcomeToast } from '../lib/askHermes'
import { useUndoToast } from './UndoToast'
import { ICON_PROPS } from '../lib/iconProps'
import { uploadFileToR2 } from '../lib/r2Upload'
import { useUploadQueue } from '../lib/useUploadQueue'

const EMOJI_QUICK = ['👍', '❤️', '🎉', '👀', '🔥', '💡', '✅', '⚠️', '📝', '🤖', '🚀', '🙏']

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
  /** rows for the textarea; default 2. This is the RESTING height. */
  rows?: number
  /** The field grows with what is typed up to this many lines, then scrolls
   *  inside itself; default 8. A fixed-height field scrolled its first line
   *  out of view while typing (Today compose, 2026-10-10). */
  maxRows?: number
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
    rows = 2,
    maxRows = 8,
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
  const queryClient = useQueryClient()

  // State: caller-controlled in custom mode (if value/onChange provided), else owned here.
  const [internalVal, setInternalVal] = useState('')
  const isControlled = isCustomMode && typeof (props as CustomModeProps).value === 'string'
  const val = isControlled ? ((props as CustomModeProps).value as string) : internalVal
  // Mirrors `val` into a ref every render (backlog #1118, race 2) so an
  // in-flight async callback — insertAtCursor after `await uploadFileToR2`,
  // which can resolve seconds after the paste/click that started it — always
  // resolves a functional update against the LATEST value, not the one
  // closed over when the callback was created. The uncontrolled branch
  // already reads fresh state via setInternalVal's own functional-update
  // form; only the controlled branch (value/onChange owned by the caller,
  // e.g. ProjectDetail's quick-compose) had no such guarantee — it captured
  // `val` as a plain variable, so an insert that resolved after the user had
  // since typed more text overwrote that typing with a stale base string.
  const valRef = useRef(val)
  valRef.current = val
  const setVal = useCallback((next: string | ((cur: string) => string)) => {
    if (isControlled) {
      const onChange = (props as CustomModeProps).onChange
      if (!onChange) return
      const resolved = typeof next === 'function' ? (next as (cur: string) => string)(valRef.current) : next
      onChange(resolved)
    } else {
      setInternalVal((cur) => (typeof next === 'function' ? (next as (cur: string) => string)(cur) : next))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isControlled])

  const [focused, setFocused] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
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
    // React 19 mounts a controlled textarea by setting defaultValue and then
    // the same value, so the caret starts at 0. Put it at the end once, so a
    // composer opened on existing text (MeetingDetail "Edit notes") takes
    // toolbar inserts at the end until the user places the caret (#1360).
    const ta = textareaRef.current
    if (ta) ta.setSelectionRange(ta.value.length, ta.value.length)
  }, [])

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
    // ── @hermes prefix (task mode): unified timeline (Hermes wave Phase 5) ──────
    // A typed "@hermes …" is a PRIVATE ask on this task. The POST contract
    // (visibility='author', token kept intact, in-thread answer — owner
    // decision A) lives in askHermesOnTask (src/lib/askHermes.ts), shared with
    // OverviewQuickAdd (TaskDetailPanel.tsx) so the two task composers cannot
    // drift on it (backlog #545). Runs AFTER the launch-tag interception
    // (@workon/@quickchat still win) and only on the PREFIX form. The Hermes
    // toggle's @hermes prepend is intentionally left as-is (still a team
    // comment) — only a typed prefix routes here.
    if (!isCustomMode && isHermesPrefix(raw)) {
      const taskId = (props as TaskModeProps).taskId
      const result = await askHermesOnTask(taskId, raw)
      if (result.ok) {
        setVal('')
        queryClient.invalidateQueries({ queryKey: ['task-activity', taskId] })
        // Shared copy (src/lib/askHermes.ts) — the POST differs from the day feed's,
        // the outcome wording does not.
        const toast = hermesOutcomeToast(result, 'Posted')
        ;(toast.kind === 'info' ? undoToast.showInfo : undoToast.showSuccess)(toast.text)
      } else {
        console.error('@hermes from task compose failed:', result.error)
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
  }, [val, showMeLock, meLocked, showHermesToggle, hermesLocked, isCustomMode, props, isControlled, setVal, taskMutation, undoToast, tryLaunchCommand, launchContext, ownLaunchRouting, queryClient])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }, [submit])

  // Upload queue (backlog #1118, extracted for #1356/#1358). Every incoming
  // batch of files (the `multiple` picker, a multi-file paste, a drop) goes
  // onto ONE FIFO queue drained by a single loop, via the shared
  // ../lib/useUploadQueue.ts. That keeps the old race unrepresentable: the
  // shared `uploading` boolean used to flip back to false the instant
  // WHICHEVER upload finished first, even while a sibling was still in
  // flight. `uploading` is derived from the queue and has no setter here.
  const uploadOneFile = useCallback(async (file: File) => {
    if (!uploadContext) return
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
    try {
      // Shared presign -> PUT -> done chain (backlog #545) — see
      // ../lib/r2Upload.ts; OverviewQuickAdd (TaskDetailPanel.tsx) calls the
      // same function so the two composers can't drift on this again.
      const { url } = await uploadFileToR2(file, uploadContext)
      // Refresh the entity's attachment list (FileUpload's query key), as
      // ProjectDetail's own drop handler did before the drop moved in here.
      queryClient.invalidateQueries({ queryKey: ['attachments', uploadContext.entityType ?? uploadContext.type, uploadContext.id] })
      insertAtCursor(isImage ? `![${file.name}](${url}) ` : `[${file.name}](${url}) `)
      undoToast.showSuccess(`Attached ${file.name}`)
    } catch (err) {
      console.error('Attach failed:', err)
      undoToast.showError(`Attach failed: ${err instanceof Error ? err.message : 'please try again.'}`)
    } finally {
      setPendingUploads((prev) => prev.filter((p) => p.id !== previewId))
    }
  }, [uploadContext, insertAtCursor, undoToast, queryClient])

  const { enqueue: enqueueUploads, uploading } = useUploadQueue(uploadOneFile)

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0 || !uploadContext) return
    enqueueUploads(files)
  }, [uploadContext, enqueueUploads])

  // Drop-to-attach (#1358). The box owns its drop, so a host page never wraps
  // SmartCompose in a second drop zone with a second queue and a second
  // uploading flag (ProjectDetail used to). Only a drag carrying FILES is
  // claimed; any other drag (dnd-kit, text, the Today HTML5 list drags)
  // passes through untouched. No uploadContext means no drop target at all.
  const [dragOver, setDragOver] = useState(false)
  const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!uploadContext || !dragHasFiles(e)) return
    e.preventDefault()
    setDragOver(true)
  }, [uploadContext])
  const handleDragLeave = useCallback(() => setDragOver(false), [])
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!uploadContext || !dragHasFiles(e)) return
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [uploadContext, handleFiles])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!uploadContext) return
    // Every 'file' clipboard item, not just the first (backlog #1118) —
    // copying several images from a file manager and pasting them here used
    // to silently keep only the one `items.find()` happened to return.
    const fileItems = Array.from(e.clipboardData?.items || []).filter((it) => it.kind === 'file')
    if (fileItems.length === 0) return
    e.preventDefault()
    const dt = new DataTransfer()
    for (const item of fileItems) {
      const f = item.getAsFile()
      if (f) dt.items.add(f)
    }
    if (dt.files.length > 0) handleFiles(dt.files)
  }, [uploadContext, handleFiles])

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    // --cream is white in light and the body black in dark, so the field sits
    // as a well against any card or drawer surface in both modes.
    background: 'var(--cream)',
    border: `1px solid ${focused ? 'var(--teal)' : 'var(--field-edge)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '8px 10px',
    color: 'var(--ink)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    lineHeight: 1.4,
  }

  const inner = (
    <>
      <MentionInput
        value={val}
        onChange={setVal}
        // insertAtCursor and the autoFocus effect both read this ref; without
        // it they saw null, appended every insertion at the end and never
        // focused (#1360).
        inputRef={textareaRef}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 100) /* let buttons handle clicks first */}
        rows={rows}
        maxRows={maxRows}
        // The badge goes in the toolbar row below, never over the text.
        commandBadge="none"
        // .smart-compose-field sets the placeholder color (index.css); an
        // inline style cannot reach ::placeholder.
        className="smart-compose-field"
        style={textareaStyle}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
      />
      {/* Pending-upload thumbnail strip: instant optimistic preview */}
      {pendingUploads.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {pendingUploads.map((p) => (
            <div
              key={p.id}
              style={{ position: 'relative', flexShrink: 0, width: 40, height: 40, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}
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
            <ToolbarBtn label="Attach file" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 {...ICON_PROPS} size={11} className="animate-spin" /> : <Paperclip size={11} strokeWidth={1.5} absoluteStrokeWidth />}
            </ToolbarBtn>
          )}
          {/* @mention */}
          <ToolbarBtn label="Mention someone" onClick={() => insertAtCursor('@')}><AtSign size={11} strokeWidth={1.5} absoluteStrokeWidth /></ToolbarBtn>
          {/* Emoji */}
          <ToolbarBtn label="Add emoji" onClick={() => setEmojiOpen((o) => !o)} active={emojiOpen}><Smile size={11} strokeWidth={1.5} absoluteStrokeWidth /></ToolbarBtn>
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
                // Built from --gold so the "queued, not posted" state keeps its
                // edge and wash in dark mode (#dcb355) as well as light (#6b5420).
                border: hermesLocked ? '1px solid color-mix(in srgb, var(--gold) 45%, transparent)' : '1px solid var(--border-subtle)',
                background: hermesLocked ? 'color-mix(in srgb, var(--gold) 12%, transparent)' : 'transparent',
                color: hermesLocked ? 'var(--gold)' : 'var(--slate)',
                fontSize: 10,
                fontWeight: hermesLocked ? 600 : 400,
                opacity: hermesLocked ? 1 : 0.70,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <HermesMark size={11} color={hermesLocked ? 'var(--gold)' : 'currentColor'} />
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
              background: 'var(--cream)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              gap: 2,
              zIndex: 20,
              boxShadow: 'var(--shadow-menu)',
            }}>
              {EMOJI_QUICK.map((e) => (
                <button
                  key={e}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => { insertAtCursor(e); setEmojiOpen(false) }}
                  style={{ width: 24, height: 24, fontSize: 15, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 3 }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--gold-active)' }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}
                >{e}</button>
              ))}
            </div>
          )}
          {/* Spacer */}
          <span style={{ flex: 1 }} />
          {/* "Command recognized" badge (e.g. Quick Chat launch) */}
          <CommandBadge value={val} />
          {/* ⌘⏎ hint */}
          {!hideKbdHint && val.trim().length > 0 && (
            <kbd style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: 9,
              padding: '1px 4px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 2,
              color: 'var(--muted)',
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
                padding: '4px 12px',
                fontSize: 11,
                background: 'var(--teal-solid)',
                color: 'var(--ink-bright, #fff)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
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

  // The wrapper owns paste (MentionInput doesn't expose it) and file drop.
  // It adds no margin or divider; the caller controls spacing.
  return (
    <div
      onPaste={handlePaste as unknown as React.ClipboardEventHandler<HTMLDivElement>}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-drag-over={dragOver ? 'true' : undefined}
      style={{
        borderRadius: 'var(--radius-md)',
        outline: dragOver ? '2px dashed var(--teal)' : 'none',
        outlineOffset: '2px',
      }}
    >
      {inner}
    </div>
  )
}

function ToolbarBtn({ children, onClick, label, active, disabled }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean; disabled?: boolean }) {
  // N5 — CSS hover via the hov-* utilities. Hover color/border equal the
  // active values, so hovering an active button is a visual no-op.
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
        background: active ? 'var(--teal-active)' : 'transparent',
        border: active ? '1px solid var(--teal)' : '1px solid var(--border-subtle)',
        color: active ? 'var(--teal)' : 'var(--slate)',
        fontSize: 11,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        '--hov-color': 'var(--teal)',
        '--hov-border': 'var(--teal)',
      } as React.CSSProperties}
    >{children}</button>
  )
}
