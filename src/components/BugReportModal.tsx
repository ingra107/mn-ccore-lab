import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Send, Image, Loader2 } from 'lucide-react'
import { useLocation } from 'react-router-dom'

interface BugReportModalProps {
  open: boolean
  onClose: () => void
}

export default function BugReportModal({ open, onClose }: BugReportModalProps) {
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ url: string; number: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const location = useLocation()

  // Focus textarea on open
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100)
      setDescription('')
      setScreenshot(null)
      setResult(null)
      setError(null)
    }
  }, [open])

  // Compress image via canvas to fit GitHub's 65K body limit
  const compressImage = useCallback((dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        // Max 800px wide, maintain aspect ratio
        const maxW = 800
        const scale = img.width > maxW ? maxW / img.width : 1
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        // JPEG at 80% quality — typically 30-50KB, fits GitHub 65K body limit
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = dataUrl
    })
  }, [])

  // Ctrl+V screenshot paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue

        const reader = new FileReader()
        reader.onload = async () => {
          const raw = reader.result as string
          const compressed = await compressImage(raw)
          setScreenshot(compressed)
        }
        reader.readAsDataURL(blob)
        return
      }
    }
  }, [compressImage])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Ctrl+Enter to submit
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [description, submitting]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!description.trim() || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const theme = document.documentElement.classList.contains('dark') ? 'dark'
        : localStorage.getItem('mn-ccore-theme') || 'light'

      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          pageUrl: location.pathname,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          theme,
          screenshot: screenshot || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      }

      const data = await res.json() as { data: { issue_number: number; issue_url: string } }
      setResult({ url: data.data.issue_url, number: data.data.issue_number })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 'var(--z-modal-backdrop)',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report a bug"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '520px',
          background: 'var(--cream)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-elevated)',
          zIndex: 'var(--z-modal)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            Report a Bug
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '4px' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {result ? (
            // Success state
            <div className="text-center py-4">
              <div
                className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(22,163,74,0.1)' }}
              >
                <Send size={20} style={{ color: 'var(--green)' }} />
              </div>
              <p style={{ fontWeight: 500, color: 'var(--ink)', fontSize: 'var(--text-base)' }}>
                Bug reported!
              </p>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-sm"
                style={{ color: 'var(--teal)' }}
              >
                View issue #{result.number} on GitHub
              </a>
              <div className="mt-4">
                <button
                  onClick={onClose}
                  className="cursor-pointer px-4 py-2 rounded-md text-sm"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            // Form
            <>
              <label
                htmlFor="bug-description"
                className="block text-xs mb-1.5"
                style={{ color: 'var(--slate)', fontWeight: 500 }}
              >
                What happened?
              </label>
              <textarea
                ref={textareaRef}
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder="Describe the bug... (Ctrl+V screenshot, Ctrl+Enter submit)"
                rows={4}
                style={{
                  width: '100%',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--sp-sm) var(--sp-md)',
                  color: 'var(--ink)',
                  fontSize: 'var(--text-sm)',
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'var(--font-sans)',
                }}
              />

              {/* Screenshot preview */}
              {screenshot && (
                <div className="mt-3 relative" style={{ maxHeight: '200px', overflow: 'hidden', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <img
                    src={screenshot}
                    alt="Bug screenshot"
                    style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '200px', objectFit: 'contain', background: 'var(--surface-0)' }}
                  />
                  <button
                    onClick={() => setScreenshot(null)}
                    className="cursor-pointer"
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(0,0,0,0.6)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'white',
                    }}
                    aria-label="Remove screenshot"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Paste hint */}
              {!screenshot && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Image size={12} style={{ color: 'var(--slate)', opacity: 0.5 }} />
                  <span className="text-xs" style={{ color: 'var(--slate)', opacity: 0.5 }}>
                    Ctrl+V to paste a screenshot
                  </span>
                </div>
              )}

              {/* Auto-captured context (shown as hint) */}
              <div className="mt-3 text-xs" style={{ color: 'var(--slate)', opacity: 0.4 }}>
                Page: {location.pathname} | {window.innerWidth}x{window.innerHeight}
              </div>

              {error && (
                <div className="mt-3 text-xs px-3 py-2 rounded-md" style={{ background: 'rgba(122,0,25,0.1)', color: 'var(--maroon)' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer (only when form is showing) */}
        {!result && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <button
              onClick={onClose}
              className="cursor-pointer px-4 py-2 rounded-md text-sm"
              style={{
                background: 'none',
                border: '1px solid var(--border-subtle)',
                color: 'var(--slate)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!description.trim() || submitting}
              className="cursor-pointer px-4 py-2 rounded-md text-sm flex items-center gap-2"
              style={{
                background: description.trim() && !submitting ? 'var(--teal)' : 'var(--surface-2)',
                color: description.trim() && !submitting ? 'var(--cream)' : 'var(--slate)',
                border: 'none',
                cursor: description.trim() && !submitting ? 'pointer' : 'default',
                opacity: description.trim() && !submitting ? 1 : 0.5,
              }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
