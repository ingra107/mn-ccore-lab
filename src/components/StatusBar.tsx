interface StatusBarProps {
  onOpenShortcuts: () => void
}

// #85: the "Sync time unknown" clock was REMOVED. It read a local-storage key
// (mnccore_last_sync_at) that nothing ever writes — the PB → Hub sync runs on
// Nick's CLI machine and cannot reach a team member's browser localStorage — so
// the clock showed "Sync time unknown" for everyone, forever. Per the codex
// ethos (a control that can't be made truthful is removed, not faked — the same
// "never a comforting fake" principle behind the prior P1-13 change), the dead
// indicator is gone. The bar now just hosts the keyboard-shortcuts hint.

export default function StatusBar({ onOpenShortcuts }: StatusBarProps) {
  return (
    <div
      role="status"
      aria-label="Status bar"
      style={{
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 var(--sp-lg)',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-ui)',
        color: 'var(--slate)',
        opacity: 0.85,
        background: 'var(--surface-2)',
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <button
        onClick={onOpenShortcuts}
        aria-label="Open keyboard shortcuts (press ?)"
        title="Open keyboard shortcuts"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-ui)',
          color: 'var(--slate)',
          cursor: 'pointer',
          opacity: 1,
          lineHeight: 1,
        }}
      >
        ? for shortcuts
      </button>
    </div>
  )
}
