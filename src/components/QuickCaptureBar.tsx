import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Check } from 'lucide-react'
import { usePBCapture } from '../hooks/useMutations'

export default function QuickCaptureBar() {
  const [text, setText] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const capture = usePBCapture()

  // Ctrl+N focuses the input from anywhere on dashboard
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return

    // Parse prefix: "idea:" -> type='idea', "note:" -> type='note', otherwise 'task'
    let type: 'task' | 'idea' | 'note' = 'task'
    let captureText = trimmed

    if (/^idea:/i.test(trimmed)) {
      type = 'idea'
      captureText = trimmed.replace(/^idea:\s*/i, '')
    } else if (/^note:/i.test(trimmed)) {
      type = 'note'
      captureText = trimmed.replace(/^note:\s*/i, '')
    }

    capture.mutate(
      { text: captureText, type },
      {
        onSuccess: () => {
          setText('')
          setShowSuccess(true)
          setTimeout(() => setShowSuccess(false), 1500)
        },
      }
    )
  }, [text, capture])

  return (
    <div
      className="relative mb-4"
      style={{
        width: '100%',
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{
          height: 40,
          padding: '0 12px',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--cream)',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Quick capture... (task, idea:, note:)"
          disabled={capture.isPending}
          className="flex-1 bg-transparent border-none outline-none text-[13px]"
          style={{
            color: 'var(--ink)',
            fontFamily: 'inherit',
          }}
        />

        {/* Success flash */}
        {showSuccess && (
          <div
            className="flex items-center gap-1"
            style={{
              color: 'var(--green)',
              fontSize: '11px',
              fontWeight: 500,
              animation: 'fadeInOut 1.5s ease forwards',
            }}
          >
            <Check size={12} />
            Captured
          </div>
        )}

        {/* Submit button (visible when text is entered) */}
        {text.trim() && !showSuccess && (
          <button
            onClick={handleSubmit}
            disabled={capture.isPending}
            style={{
              background: 'none',
              border: 'none',
              cursor: capture.isPending ? 'wait' : 'pointer',
              color: 'var(--teal)',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              opacity: capture.isPending ? 0.4 : 0.7,
              transition: 'opacity 150ms ease',
            }}
          >
            <Send size={14} />
          </button>
        )}

        {/* Keyboard hint */}
        {!text && !showSuccess && (
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--slate)', opacity: 0.35 }}>
            Ctrl+N
          </span>
        )}
      </div>

      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateX(4px); }
          20% { opacity: 1; transform: translateX(0); }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
