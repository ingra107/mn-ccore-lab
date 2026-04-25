// SmartCompose — dark-themed compose surface for TodayPage/UnifiedMyTasks
// task drawers. Real @-mention via MentionInput, emoji picker, file attach
// via the R2 upload flow, Cmd+Enter to post.
//
// Closes Phase 38 eval Issue 8 (compose toolbar @/:/📎 were decorative).

import { useState, useRef, useCallback } from 'react'
import { Paperclip, Smile, AtSign, Loader2 } from 'lucide-react'
import MentionInput from './MentionInput'
import { usePostTaskUpdate } from '../hooks/useMutations'
import { useUndoToast } from './UndoToast'

const EMOJI_QUICK = ['👍', '❤️', '🎉', '👀', '🔥', '💡', '✅', '⚠️', '📝', '🤖', '🚀', '🙏']

const INK = '#e2e8f0'
const INK_DIM = '#7a828c'
const ACCENT_GOLD = '#c9a84c'
const ACCENT_TEAL = '#5cbcb4'

interface SmartComposeProps {
  taskId: string
  placeholder?: string
  /** When true, the compose is wrapped with a labeled "Add note" header
   *  (UnifiedMyTasks drawer style). When false, just the textarea + toolbar
   *  (TodayPage drawer inline style). */
  boxed?: boolean
}

export default function SmartCompose({ taskId, placeholder = 'Add a note, or @hermes for AI…', boxed = false }: SmartComposeProps) {
  const [val, setVal] = useState('')
  const [focused, setFocused] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const post = usePostTaskUpdate(taskId)
  const undoToast = useUndoToast()

  const showToolbar = focused || val.length > 0 || emojiOpen

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
  }, [])

  const submit = useCallback(() => {
    const content = val.trim()
    if (!content) return
    post.mutate({ content }, {
      onSuccess: () => {
        setVal('')
        undoToast.showSuccess('Note posted')
      },
    })
  }, [val, post, undoToast])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }, [submit])

  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const urlRes = await fetch('/api/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          context: { type: 'task', id: taskId },
        }),
      })
      const urlData = await urlRes.json() as { data?: { uploadUrl: string; key: string } }
      if (!urlData.data?.uploadUrl) throw new Error('Failed to get upload URL — R2 may not be configured')
      await fetch(urlData.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      const doneRes = await fetch('/api/upload/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: urlData.data.key,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          entityType: 'task',
          entityId: taskId,
        }),
      })
      const doneData = await doneRes.json() as { data?: { downloadUrl?: string } }
      const url = doneData.data?.downloadUrl ?? `/api/files/${urlData.data.key}`
      insertAtCursor(`[${file.name}](${url}) `)
      undoToast.showSuccess(`Attached ${file.name}`)
    } catch (err) {
      console.error('Attach failed:', err)
      alert(`Attach failed: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setUploading(false)
    }
  }, [taskId, insertAtCursor, undoToast])

  const inner = (
    <>
      <MentionInput
        value={val}
        onChange={setVal}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 100) /* let buttons handle clicks first */}
        rows={2}
        style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '6px 10px', color: INK, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
      />
      {showToolbar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, position: 'relative' }}>
          <ToolbarBtn label="Mention someone" onClick={() => insertAtCursor('@')}><AtSign size={11} /></ToolbarBtn>
          <ToolbarBtn label="Add emoji" onClick={() => setEmojiOpen((o) => !o)} active={emojiOpen}><Smile size={11} /></ToolbarBtn>
          <ToolbarBtn label="Attach file" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
          </ToolbarBtn>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
          />
          {emojiOpen && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, padding: 6, background: '#0f1923', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, display: 'flex', gap: 2, zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
              {EMOJI_QUICK.map((e) => (
                <button
                  key={e}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => { insertAtCursor(e); setEmojiOpen(false) }}
                  style={{ width: 24, height: 24, fontSize: 15, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 3 }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent' }}
                >{e}</button>
              ))}
            </div>
          )}
          <span style={{ flex: 1 }} />
          {val.trim().length > 0 && (
            <button
              type="button"
              onClick={submit}
              disabled={post.isPending}
              style={{ padding: '3px 10px', fontSize: 11, background: ACCENT_GOLD, color: '#0b1017', border: 'none', borderRadius: 3, cursor: post.isPending ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
            >{post.isPending ? 'Posting…' : 'Post'}</button>
          )}
          <kbd style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: 9, padding: '1px 4px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, color: INK_DIM }}>⌘ ⏎</kbd>
        </div>
      )}
    </>
  )

  if (boxed) {
    return (
      <div style={{ marginTop: 18, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Add note</div>
        {inner}
      </div>
    )
  }
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
      {inner}
    </div>
  )
}

function ToolbarBtn({ children, onClick, label, active, disabled }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 4,
        background: active ? 'rgba(92,188,180,0.15)' : 'transparent',
        border: `1px solid ${active ? 'rgba(92,188,180,0.30)' : 'rgba(255,255,255,0.06)'}`,
        color: active ? ACCENT_TEAL : INK_DIM,
        fontSize: 11,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { if (!disabled && !active) { e.currentTarget.style.color = ACCENT_TEAL; e.currentTarget.style.borderColor = 'rgba(92,188,180,0.30)' } }}
      onMouseLeave={(e) => { if (!disabled && !active) { e.currentTarget.style.color = INK_DIM; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' } }}
    >{children}</button>
  )
}
