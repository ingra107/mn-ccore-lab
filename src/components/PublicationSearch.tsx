import { useState, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'

interface PublicationSearchProps {
  value: string
  onChange: (value: string) => void
  resultCount: number
}

export default function PublicationSearch({
  value,
  onChange,
  resultCount,
}: PublicationSearchProps) {
  const [internal, setInternal] = useState(value)

  // Sync external value changes (e.g. URL-driven clear)
  useEffect(() => {
    setInternal(value)
  }, [value])

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (internal !== value) {
        onChange(internal)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [internal, onChange, value])

  const handleClear = useCallback(() => {
    setInternal('')
    onChange('')
  }, [onChange])

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--slate)' }}
          aria-hidden="true"
        />
        <input
          type="text"
          value={internal}
          onChange={(e) => setInternal(e.target.value)}
          placeholder="Search publications..."
          className="w-full pl-10 pr-10 py-2 rounded-md text-sm"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            background: 'var(--cream)',
            color: 'var(--ink)',
            border: '1px solid rgba(201, 168, 76, 0.2)',
            minHeight: '44px',
            outline: 'none',
            transitionProperty: 'border-color',
            transitionDuration: '200ms',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--gold)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.2)'
          }}
          aria-label="Search publications"
        />
        {internal && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer p-0.5 rounded"
            style={{
              color: 'var(--slate)',
              background: 'transparent',
              border: 'none',
              lineHeight: 0,
            }}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {value && (
        <span
          className="block mt-1.5 text-xs"
          style={{
            color: 'var(--slate)',
          }}
        >
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
