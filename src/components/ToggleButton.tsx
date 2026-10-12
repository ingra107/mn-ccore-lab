interface ToggleButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}

export default function ToggleButton({ active, onClick, children, className }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tk-btn tk-sm${active ? ' tk-sel' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </button>
  )
}
