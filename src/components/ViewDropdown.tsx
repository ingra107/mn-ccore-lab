import { useState, useRef, useEffect } from 'react'
import { ChevronDown, List } from 'lucide-react'

interface ViewOption {
  key: string
  label: string
  icon: typeof List
  description: string
}

interface ViewDropdownProps {
  currentView: string
  onSelect: (key: string) => void
  views: ViewOption[]
}

export default function ViewDropdown({ currentView, onSelect, views }: ViewDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const currentOption = views.find(v => v.key === currentView)
  const CurrentIcon = currentOption?.icon || List

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
        style={{
          fontFamily: 'var(--font-sans)',
          color: currentOption ? 'var(--teal)' : 'var(--slate)',
          backgroundColor: currentOption ? 'rgba(45,138,138,0.08)' : 'transparent',
          borderColor: currentOption ? 'var(--teal)' : 'var(--border-light)',
          cursor: 'pointer',
        }}
      >
        {currentOption && <CurrentIcon size={13} />}
        {currentOption ? currentOption.label : 'More views'}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-lg border shadow-lg z-50 py-1 min-w-[200px]"
          style={{ backgroundColor: 'var(--card-bg, #fff)', borderColor: 'var(--border-light)' }}
        >
          {views.map((v) => {
            const Icon = v.icon
            return (
              <button
                key={v.key}
                onClick={() => { onSelect(v.key); setOpen(false) }}
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ cursor: 'pointer', border: 'none', background: 'none' }}
              >
                <Icon size={16} style={{ color: currentView === v.key ? 'var(--teal)' : 'var(--slate)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: currentView === v.key ? 'var(--teal)' : 'var(--ink)' }}>
                    {v.label}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
                    {v.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
