import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Send, Image, Loader2 } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import Modal from './ui/Modal'
import { ICON_PROPS } from '../lib/iconProps'

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
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  // File input (for mobile — Ctrl+V paste isn't available on touch devices)
  const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const raw = reader.result as string
      const compressed = await compressImage(raw)
      setScreenshot(compressed)
    }
    reader.readAsDataURL(file)
    // Reset so picking the same file again still fires onChange
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [compressImage])

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

  const footer = !result ? (
    <>
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
          background: description.trim() && !submitting ? 'var(--teal-solid)' : 'var(--surface-2)',
          color: description.trim() && !submitting ? 'var(--cream)' : 'var(--slate)',
          border: 'none',
          cursor: description.trim() && !submitting ? 'pointer' : 'default',
          opacity: description.trim() && !submitting ? 1 : 0.85,
        }}
      >
        {submitting ? <Loader2 {...ICON_PROPS} size={14} className="animate-spin" /> : <Send {...ICON_PROPS} size={14} />}
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </>
  ) : undefined

  return (
    <Modal open={open} onClose={onClose} title="Report a Bug" maxWidth="md" footer={footer}>
      {result ? (
            // Success state
            <div className="text-center py-4">
              <div
                className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(22,163,74,0.1)' }}
              >
                <Send {...ICON_PROPS} size={20} style={{ color: 'var(--green)' }} />
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
                    <X {...ICON_PROPS} size={14} />
                  </button>
                </div>
              )}

              {/* Attach photo / paste hint */}
              {!screenshot && (
                <div className="flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs"
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 10px',
                      color: 'var(--slate)',
                      cursor: 'pointer',
                    }}
                  >
                    <Image {...ICON_PROPS} size={12} />
                    Attach photo
                  </button>
                  <span className="text-xs hidden sm:inline" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                    or Ctrl+V to paste
                  </span>
                </div>
              )}
              {/* No `capture="environment"` — that forces camera-only and
                  hides the photo library. Without it, mobile gets the
                  standard picker (Take Photo / Photo Library / Files),
                  so Nick can pick an existing screenshot. GH #8. r7 2026-04-23. */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFilePick}
                style={{ display: 'none' }}
              />

              {/* Auto-captured context (shown as hint) */}
              <div className="mt-3 text-xs" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                Page: {location.pathname} | {window.innerWidth}x{window.innerHeight}
              </div>

              {error && (
                <div className="mt-3 text-xs px-3 py-2 rounded-md" style={{ background: 'rgba(122,0,25,0.1)', color: 'var(--maroon)' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </Modal>
  )
}
