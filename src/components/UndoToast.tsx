import { useState, useCallback, useRef, useEffect, useMemo, createContext, useContext } from 'react'
import { Undo2, X, Check, AlertCircle, Info } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'

interface ToastAction {
  label: string
  onClick: () => void
}

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
  // S16: an optional named action (e.g. "Open →") so create flows can offer a
  // working follow-through instead of dead-ending in silence. Distinct from
  // the Undo affordance, which is reserved for the undo-toast variant.
  action?: ToastAction
}

interface ErrorToast {
  id: string
  type: 'error'
  message: string
  action?: ToastAction
}

interface InfoToast {
  id: string
  type: 'info'
  message: string
  action?: ToastAction
}

type Toast = UndoToast | SuccessToast | ErrorToast | InfoToast

// Per-type presentation — testid, left-border accent, and icon. One lookup
// instead of a parallel ternary chain per property (#252 finding 2).
const TOAST_STYLES: Record<Toast['type'], {
  testId: string
  borderColor: string | null
  Icon: typeof Check | null
  iconColor: string
}> = {
  success: { testId: 'success-toast', borderColor: 'var(--teal)',   Icon: Check,       iconColor: 'var(--teal)' },
  error:   { testId: 'error-toast',   borderColor: 'var(--maroon)', Icon: AlertCircle, iconColor: 'var(--maroon)' },
  info:    { testId: 'info-toast',    borderColor: 'var(--gold)',   Icon: Info,        iconColor: 'var(--gold)' },
  undo:    { testId: 'undo-toast',    borderColor: null,            Icon: null,        iconColor: '' },
}

interface ToastContextType {
  showUndo: (message: string, onUndo: () => void) => void
  showSuccess: (message: string, action?: ToastAction) => void
  showError: (message: string, action?: ToastAction) => void
  showInfo: (message: string, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextType>({ showUndo: () => {}, showSuccess: () => {}, showError: () => {}, showInfo: () => {} })

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

  const showSuccess = useCallback((message: string, action?: ToastAction) => {
    const id = Date.now().toString() + '-s'
    setToasts((prev) => [...prev, { id, type: 'success', message, action }])

    // Auto-dismiss after 3 seconds (shorter than undo)
    const timer = setTimeout(() => {
      timers.current.delete(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
    timers.current.set(id, timer)
  }, [])

  const showError = useCallback((message: string, action?: ToastAction) => {
    const id = Date.now().toString() + '-e'
    setToasts((prev) => [...prev, { id, type: 'error', message, action }])

    // Auto-dismiss after 5 seconds — errors need more reading time
    const timer = setTimeout(() => {
      timers.current.delete(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
    timers.current.set(id, timer)
  }, [])

  const showInfo = useCallback((message: string, action?: ToastAction) => {
    const id = Date.now().toString() + '-i'
    setToasts((prev) => [...prev, { id, type: 'info', message, action }])

    // Auto-dismiss after 3 seconds (same as success)
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

  // Stable context value — all show* callbacks are useCallback'd so the
  // memo key never changes. Without this, every state-driven re-render of
  // UndoToastProvider hands consumers a fresh object and re-renders them
  // (PortalLayout wraps all portal pages — expensive).
  const contextValue = useMemo(() => ({ showUndo, showSuccess, showError, showInfo }), [showUndo, showSuccess, showError, showInfo])

  return (
    <ToastContext.Provider value={contextValue}>
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
        {toasts.map((toast) => {
          const presentation = TOAST_STYLES[toast.type]
          return (
          <div
            key={toast.id}
            data-testid={presentation.testId}
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
              fontWeight: toast.type === 'undo' ? 500 : 400,
              boxShadow: 'var(--shadow-card-hover)',
              minWidth: '240px',
              borderLeft: presentation.borderColor ? `3px solid ${presentation.borderColor}` : 'none',
            }}
          >
            {presentation.Icon && (
              <presentation.Icon {...ICON_PROPS} size={14} style={{ color: presentation.iconColor, flexShrink: 0 }} />
            )}
            <span style={{ flex: 1 }}>{toast.message}</span>
            {toast.type !== 'undo' && toast.action && (
              <button
                data-testid="toast-action-button"
                onClick={() => { toast.action!.onClick(); dismiss(toast.id) }}
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
                {toast.action.label}
              </button>
            )}
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
                <Undo2 {...ICON_PROPS} size={12} />
                Undo
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Close"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                padding: 'var(--sp-xs)',
                minHeight: 44,
                minWidth: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X {...ICON_PROPS} size={14} />
            </button>
          </div>
          )
        })}
      </div>
      </ToastContext.Provider>
  )
}
