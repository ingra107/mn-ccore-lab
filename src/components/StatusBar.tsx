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
//
// Desktop only (lg+, where the sidebar lives). Below lg the fixed MobileTabBar
// covers the page foot, so the bar sat entirely under it, and a keyboard hint
// with an 11px-tall target is dead weight on a phone (overnight 2026-10-14
// audit, G9-13 / G4-7 / G1-11). `hidden lg:flex` owns `display`, so the inline
// style must not set it.

export default function StatusBar({ onOpenShortcuts }: StatusBarProps) {
  return (
    <div
      role="status"
      aria-label="Status bar"
      className="hidden lg:flex"
      style={{
        height: '24px',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 var(--sp-lg)',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-ui)',
        color: 'var(--slate)',
        opacity: 0.85,
        background: 'color-mix(in srgb, var(--sk-t1) 6%, transparent)',
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
