import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [clearTimer])

  const handleUndo = useCallback((toast: UndoToast) => {
    toast.onUndo()
    dismiss(toast.id)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showUndo, showSuccess }}>
      {children}

      {/* Toast container — fixed bottom-center */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15, mass: 0.6 }}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 16px',
                borderRadius: '10px',
                background: 'var(--ink)',
                color: 'var(--cream)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: toast.type === 'success' ? 400 : 500,
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
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
                  onClick={() => handleUndo(toast)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'rgba(255,255,255,0.15)',
                    color: 'var(--gold)',
                    fontFamily: 'var(--font-sans)',
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
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
