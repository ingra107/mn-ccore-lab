interface ToggleButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}

export default function ToggleButton({ active, onClick, children, className }: ToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] border transition-colors ${className || ''}`}
      style={{
        borderColor: active ? 'var(--job-accent)' : 'var(--border-subtle)',
        backgroundColor: active ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'transparent',
        color: active ? 'var(--job-accent)' : 'var(--slate)',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
