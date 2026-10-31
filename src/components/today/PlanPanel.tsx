// PlanPanel -- the side panel the planning conversation opens in (Nick's pick,
// PB Context/Decisions/2026-10-30-planning-and-first-step-mockup-picks.md:
// "side panel"). A container only: PlanConversation knows nothing about it, so
// the same conversation can later sit in a page or a sheet.
//
// Portalled to <body> for the reason TaskDetailPanel gives: a fixed element
// inside a transformed ancestor lays out against that ancestor, not the page.
// Desktop: a right-hand panel. Phone: the full screen. Escape and the
// backdrop close it; closing never writes anything (the draft is lost).

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '../ui/Button'
import { PlanConversation } from './PlanConversation'
import type { TaskRow } from '../../lib/api'

export function PlanPanel({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])

  return createPortal(
    <div className="tk">
      <div className="tk-plan-backdrop" data-testid="plan-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-panel-title"
        data-testid="plan-panel"
        className="tk-plan-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tk-plan-head">
          <h2 id="plan-panel-title">Plan your week</h2>
          <Button size="icon" type="button" aria-label="Close" title="Close without saving" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
        <div className="tk-plan-body">
          <PlanConversation task={task} onDone={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
