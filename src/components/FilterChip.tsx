import type { CSSProperties } from 'react'

interface FilterChipProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}

const caretSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`

export default function FilterChip({ value, onChange, options, className }: FilterChipProps) {
  const isActive = !!value

  const style: CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    color: isActive ? 'var(--teal)' : 'var(--slate)',
    backgroundColor: isActive ? 'rgba(45,138,138,0.06)' : 'transparent',
    borderColor: isActive ? 'var(--teal)' : 'var(--border-light)',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: caretSvg,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    paddingRight: '24px',
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-full border px-3 py-1.5 text-xs ${className || ''}`}
      style={style}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
