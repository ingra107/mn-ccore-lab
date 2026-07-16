import { useState, useEffect } from 'react'
import { AlignJustify, List, StretchHorizontal } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'

type Density = 'compact' | 'default' | 'relaxed'

const STORAGE_KEY = 'hub-table-density'

const modes: { key: Density; icon: typeof List; title: string }[] = [
  { key: 'compact', icon: AlignJustify, title: 'Compact' },
  { key: 'default', icon: List, title: 'Default' },
  { key: 'relaxed', icon: StretchHorizontal, title: 'Relaxed' },
]

// P3-7 (2026-06-09): ONE global density. Compact is the default (Nick is the
// daily power user and wants maximum info density). The density class is
// applied at the document root (<html>) so `--row-height` cascades to every
// page — there is no longer a per-view toggle or per-page wrapper class. The
// only control lives in Settings → Appearance. The `index.html` pre-paint
// script sets the same class synchronously to avoid CLS on first render.
const VALID: Density[] = ['compact', 'default', 'relaxed']

function readDensity(): Density {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as Density | null
    return v && VALID.includes(v) ? v : 'compact'
  } catch { return 'compact' }
}

function applyRootDensity(density: Density) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('density-compact', 'density-relaxed')
  if (density === 'compact') root.classList.add('density-compact')
  else if (density === 'relaxed') root.classList.add('density-relaxed')
  root.setAttribute('data-density', density)
}

// Clean fix is extracting this hook to src/hooks/useDensity.ts, but its 6
// importers span src/pages/** (out of scope for this partition) and
// src/components/today/TaskRow.tsx (another agent's territory this wave) —
// deferred to a follow-up that can touch both.
// eslint-disable-next-line react-refresh/only-export-components -- see comment above
export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensityState] = useState<Density>(() => readDensity())

  // Apply at the document root + persist. One source of truth; every table
  // inherits `--row-height` from <html>.
  useEffect(() => {
    applyRootDensity(density)
    try { localStorage.setItem(STORAGE_KEY, density) } catch { /* unavailable */ }
  }, [density])

  // Cross-tab / cross-component sync — Settings is the single control but any
  // surface that reads the hook stays in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setDensityState(readDensity())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return [density, setDensityState]
}

// Architecture note (Phase E, 2026-06-15): SharedTaskRow's `dense` boolean prop
// is now wired to `density === 'compact'` via useDensity() at every call site
// (Today adapter, MyTasksRow/ColumnsView, HubTaskRow/PersonalPage). The single
// control remains in SettingsPage → DensityControl. This file is NOT superseded —
// useDensity() is the canonical hook; DensityToggle is the Settings UI widget.

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
            background: value === key ? 'var(--teal-active)' : 'none',
            color: value === key ? 'var(--teal)' : 'var(--slate)',
            opacity: value === key ? 1 : 0.85,
            transition: `background var(--duration-fast), opacity var(--duration-fast)`,
          }}
        >
          <Icon {...ICON_PROPS} size={12} />
        </button>
      ))}
    </div>
  )
}
