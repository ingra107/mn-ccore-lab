import { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false)
  // N1.09 — mobile drops to a 2-FAB stack: flick-scroll makes this FAB
  // redundant there, and three stacked FABs covered the rows' right meta.
  const isMobile = useIsMobile()

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  if (!visible || isMobile) return null

  return (
    <button
      data-testid="scroll-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed z-50 rounded-full shadow-lg border transition-all"
      style={{
        bottom: 'var(--fab-stack-3)',
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
        opacity: 0.85,
      }}
      title="Scroll to top"
      aria-label="Scroll to top"
    >
      <ArrowUp size={16} />
    </button>
  )
}
