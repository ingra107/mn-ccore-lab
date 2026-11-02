import { SquareTerminal } from 'lucide-react'
import { buildPrepStartUri } from '../lib/urlClassify'
import { useProtocolLaunch } from '../hooks/useProtocolLaunch'
import { usePrepStartAllowed } from '../hooks/usePrepStartAllowed'
import { ICON_PROPS } from '../lib/iconProps'

// Prep & start (2026-11-02, PB Context/Decisions/2026-11-02-prep-and-start.md).
// Nick: "I guess i would assume that if i click start i am getting an interactive
// session" and "a prep and start which can do the prep in an interactive session and
// then be ready for me ... it will also know what needs to be opened for me to
// workon etc".
//
// It fires mnccore://prep/<task id>. On Nick's laptop PB checks the task is open in
// its own copy, opens a Claude window that re-reads the task's threads and comments,
// asks before it changes the task, prepares the first step with him and opens the
// draft, doc or folder he needs. Per task, never a batch: one click, one window.
// It does not count toward the day's prepared first steps (no packet is made by
// the click; the session is his).
//
// `ready`: the task already has a prepared first step, so the label is "Open
// session" (the session starts from that step). Same verb either way.
//
// Gate, same as RunSkillAction and WorkOnActions: the launcher is installed on this
// computer and the viewer is the PI (the PB launcher is Nick's own).

interface Props {
  taskId: string
  done?: boolean
  ready?: boolean
  /** 'slot' = a row's 24px action; 'primary' = the same, teal (the row's one primary
   *  action); 'rail' = full width in a panel. */
  variant?: 'slot' | 'primary' | 'rail'
}

export default function PrepStartAction({ taskId, done = false, ready = false, variant = 'slot' }: Props) {
  const { launch } = useProtocolLaunch()
  const allowed = usePrepStartAllowed()
  const uri = buildPrepStartUri(taskId)

  if (done || !uri || !allowed) return null

  const label = ready ? 'Open session' : 'Prep & start'
  const tip = ready
    ? 'Open a Claude session on this machine that starts from the prepared step, checks the threads, and opens what you need'
    : 'Open a Claude session on this machine that checks the threads, prepares this with you, and opens what you need'
  const go = (e: React.MouseEvent) => {
    e.stopPropagation()
    void launch(uri, { successMessage: 'Opening a Claude session for this task on this machine…' })
  }

  if (variant === 'rail') {
    return (
      <button
        type="button"
        onClick={go}
        className="tk-btn"
        aria-label={tip}
        data-testid="prep-start"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-sm)', width: '100%', fontSize: 'var(--text-small)', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '8px 12px' }}
      >
        <SquareTerminal {...ICON_PROPS} size={14} /> {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={go}
      className={`tk-btn tk-sm tip${variant === 'primary' ? ' tk-pri' : ''}`}
      data-tip={tip}
      aria-label={tip}
      data-testid="prep-start"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', height: 24, padding: '0 8px', flexShrink: 0 }}
    >
      <SquareTerminal {...ICON_PROPS} size={12} /> {label}
    </button>
  )
}
