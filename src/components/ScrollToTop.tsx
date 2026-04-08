import { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed z-30 rounded-full shadow-lg border transition-all"
      style={{
        bottom: 24,
        right: 24,
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--cream)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--slate)',
        cursor: 'pointer',
        opacity: 0.7,
      }}
      title="Scroll to top"
      aria-label="Scroll to top"
    >
      <ArrowUp size={16} />
    </button>
  )
}
