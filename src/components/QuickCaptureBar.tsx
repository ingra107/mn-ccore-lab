import { Plus } from 'lucide-react'
import { openGlobalQuickAdd } from './GlobalQuickAddModal'

// P2-10: QuickCaptureBar is no longer a separate capture input with its own
// submit path. Per Decision #5 the ⌘-style quick-add modal is the SINGLE
// canonical capture surface, so this dashboard affordance is now a trigger that
// opens that one modal (one component, one submit path, one optimistic toast).
// The previous bespoke usePBCapture input + Ctrl+N focus handler are retired;
// the documented shortcut is `q` (S11 — Ctrl+N was browser-reserved).
export default function QuickCaptureBar({ noMargin }: { noMargin?: boolean }) {
  return (
    <div
      className={noMargin ? 'relative' : 'relative mb-4'}
      style={{ width: '100%' }}
    >
      <button
        type="button"
        onClick={openGlobalQuickAdd}
        aria-label="Quick add task (press q)"
        className="flex items-center gap-2 w-full text-left"
        style={{
          height: 40,
          padding: '0 var(--sp-md)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-default)',
          background: 'var(--cream)',
          boxShadow: '0 0 0 1px var(--border-subtle)',
          cursor: 'pointer',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--teal)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
      >
        <Plus size={14} style={{ color: 'var(--teal)', opacity: 0.85, flexShrink: 0 }} />
        <span
          className="flex-1 text-[13px]"
          style={{ color: 'var(--slate)', opacity: 0.85, fontFamily: 'inherit' }}
        >
          Quick add a task…
        </span>
        <span
          className="text-[10px] flex-shrink-0"
          style={{ color: 'var(--slate)', opacity: 0.75 }}
        >
          q
        </span>
      </button>
    </div>
  )
}
