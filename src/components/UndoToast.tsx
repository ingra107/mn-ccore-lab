import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react'
import { Undo2, X, Check } from 'lucide-react'

interface UndoToast {
  id: string
  type: 'undo'
  message: string
  onUndo: () => void
}

interface SuccessToast {
  id: string
  type: 'success'
  message: string
}

type Toast = UndoToast | SuccessToast

export interface ToastContextType {
  showUndo: (message: string, onUndo: () => void) => void
  showSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextType>({ showUndo: () => {}, showSuccess: () => {} })

export function useUndoToast() {
  return useContext(ToastContext)
}

export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Clear all timeouts on unmount
  useEffect(() => {
    const currentTimers = timers.current
    return () => {
      currentTimers.forEach((timer) => clearTimeout(timer))
      currentTimers.clear()
    }
  }, [])

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showUndo = useCallback((message: string, onUndo: () => void) => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, type: 'undo', message, onUndo }])

    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => {
      timers.current.delete(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
    timers.current.set(id, timer)
  }, [])

  const showSuccess = useCallback((message: string) => {
    const id = Date.now().toString() + '-s'
    setToasts((prev) => [...prev, { id, type: 'success', message }])

    // Auto-dismiss after 3 seconds (shorter than undo)
    const timer = setTimeout(() => {
      timers.current.delete(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
    timers.current.set(id, timer)
  }, [])

  const dismiss = useCallback((id: string) => {
    clearTimer(id)
    setDismissingIds((prev) => { const s = new Set(prev); s.add(id); return s })
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      setDismissingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }, 160)
  }, [clearTimer])

  const handleUndo = useCallback((toast: UndoToast) => {
    toast.onUndo()
    dismiss(toast.id)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showUndo, showSuccess }}>
      {children}

      {/* Toast container — fixed bottom-center */}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(16px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateY(0)   scale(1); }
          to   { opacity: 0; transform: translateY(8px) scale(0.95); }
        }
      `}</style>
      <div
        data-testid="toast-container"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 'var(--z-toast)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-testid={toast.type === 'undo' ? 'undo-toast' : 'success-toast'}
            style={{
              animation: dismissingIds.has(toast.id)
                ? 'toast-out 150ms var(--ease-out) forwards'
                : 'toast-in 200ms var(--ease-out) both',
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: 'var(--sp-md) var(--sp-lg)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--ink)',
              color: 'var(--cream)',
              fontSize: '13px',
              fontWeight: toast.type === 'success' ? 400 : 500,
              boxShadow: 'var(--shadow-card-hover)',
              minWidth: '240px',
              borderLeft: toast.type === 'success' ? '3px solid var(--teal)' : 'none',
            }}
          >
            {toast.type === 'success' && (
              <Check size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            )}
            <span style={{ flex: 1 }}>{toast.message}</span>
            {toast.type === 'undo' && (
              <button
                data-testid="undo-button"
                onClick={() => handleUndo(toast)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: 'var(--sp-xs) var(--sp-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'rgba(255,255,255,0.15)',
                  color: 'var(--gold)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Undo2 size={12} />
                Undo
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      </ToastContext.Provider>
  )
}
