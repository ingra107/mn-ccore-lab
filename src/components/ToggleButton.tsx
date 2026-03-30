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
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm border transition-colors ${className || ''}`}
      style={{
        borderColor: active ? 'var(--teal)' : 'var(--border-light)',
        backgroundColor: active ? 'rgba(45,138,138,0.12)' : 'transparent',
        color: active ? 'var(--teal)' : 'var(--slate)',
        fontFamily: 'var(--font-sans)',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
