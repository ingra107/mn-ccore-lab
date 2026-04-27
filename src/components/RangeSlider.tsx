import { useEffect, useRef, useState } from 'react'

export interface RangeSliderProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  unitLabel?: string
  ariaLabel: string
  debounceMs?: number
}

export default function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 365,
  step = 1,
  unitLabel = '',
  ariaLabel,
  debounceMs = 500,
}: RangeSliderProps) {
  const [draft, setDraft] = useState<number>(value)
  const timerRef = useRef<number | null>(null)

  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const commit = (n: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (n !== value) onChange(n)
    }, debounceMs)
  }

  const handleChange = (raw: string) => {
    const n = Math.max(min, Math.min(max, Math.round(Number(raw))))
    setDraft(n)
    commit(n)
  }

  const pct = max === min ? 0 : ((draft - min) / (max - min)) * 100

  return (
    <div className="flex items-center gap-3" style={{ width: '100%', maxWidth: 420 }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={ariaLabel}
        aria-valuenow={draft}
        aria-valuemin={min}
        aria-valuemax={max}
        className="range-slider"
        style={{
          flex: 1,
          height: 4,
          appearance: 'none',
          WebkitAppearance: 'none',
          background: `linear-gradient(to right, var(--teal) 0%, var(--teal) ${pct}%, var(--border-subtle) ${pct}%, var(--border-subtle) 100%)`,
          borderRadius: 'var(--radius-full)',
          outline: 'none',
          cursor: 'pointer',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          minWidth: 56,
          textAlign: 'right',
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: 13,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {draft}
        {unitLabel && <span style={{ marginLeft: 4, color: 'var(--slate)', fontWeight: 400 }}>{unitLabel}</span>}
      </span>
      <style>{`
        .range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: var(--radius-full);
          background: var(--teal);
          border: 2px solid var(--cream);
          box-shadow: 0 0 0 1px var(--teal);
          cursor: pointer;
          transition: transform 120ms ease-out;
        }
        .range-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
        .range-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: var(--radius-full);
          background: var(--teal);
          border: 2px solid var(--cream);
          box-shadow: 0 0 0 1px var(--teal);
          cursor: pointer;
        }
        .range-slider:focus-visible {
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--teal) 35%, transparent);
        }
      `}</style>
    </div>
  )
}
