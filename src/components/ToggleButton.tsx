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
        borderColor: active ? 'var(--teal)' : 'var(--border-subtle)',
        backgroundColor: active ? 'rgba(45,138,138,0.1)' : 'transparent',
        color: active ? 'var(--teal)' : 'var(--slate)',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
