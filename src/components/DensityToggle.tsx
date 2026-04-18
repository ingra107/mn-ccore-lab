import { useState, useEffect } from 'react'
import { AlignJustify, List, StretchHorizontal } from 'lucide-react'

type Density = 'compact' | 'default' | 'relaxed'

const STORAGE_KEY = 'hub-table-density'

const modes: { key: Density; icon: typeof List; title: string }[] = [
  { key: 'compact', icon: AlignJustify, title: 'Compact' },
  { key: 'default', icon: List, title: 'Default' },
  { key: 'relaxed', icon: StretchHorizontal, title: 'Relaxed' },
]

export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Density) || 'default'
    } catch { return 'default' }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, density)
  }, [density])

  return [density, setDensity]
}

export function densityClass(density: Density): string {
  if (density === 'compact') return 'density-compact'
  if (density === 'relaxed') return 'density-relaxed'
  return ''
}

export default function DensityToggle({
  value,
  onChange,
}: {
  value: Density
  onChange: (d: Density) => void
}) {
  return (
    <div
      className="inline-flex items-center rounded-md overflow-hidden"
      style={{
        border: '1px solid var(--border-subtle)',
        background: 'var(--field-bg)',
      }}
    >
      {modes.map(({ key, icon: Icon, title }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={title}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '24px',
            border: 'none',
            cursor: 'pointer',
            background: value === key ? 'var(--teal-solid)' : 'none',
            color: value === key ? 'var(--ink-bright, #fff)' : 'var(--slate)',
            opacity: value === key ? 1 : 0.5,
            transition: `background var(--duration-fast), opacity var(--duration-fast)`,
          }}
        >
          <Icon size={12} />
        </button>
      ))}
    </div>
  )
}
