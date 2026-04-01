import { useState, useCallback, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Undo2, X } from 'lucide-react'

interface Toast {
  id: string
  message: string
  onUndo: () => void
}

interface ToastContextType {
  showUndo: (message: string, onUndo: () => void) => void
}

const ToastContext = createContext<ToastContextType>({ showUndo: () => {} })

export function useUndoToast() {
  return useContext(ToastContext)
}

export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showUndo = useCallback((message: string, onUndo: () => void) => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, message, onUndo }])

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleUndo = useCallback((toast: Toast) => {
    toast.onUndo()
    dismiss(toast.id)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showUndo }}>
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
              transition={{ duration: 0.2 }}
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
                fontWeight: 500,
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                minWidth: '240px',
              }}
            >
              <span style={{ flex: 1 }}>{toast.message}</span>
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
