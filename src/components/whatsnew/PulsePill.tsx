/**
 * PulsePill — the top-bar What's new / Lab pulse pill (#156, layout A).
 *
 * One pill, one panel, two tabs. The pill reads gold "What's new" while this
 * person has an unopened release or announcement (or, for the PI, a draft
 * waiting), and "Lab pulse · N active" otherwise; the panel opens on the tab
 * the pill names. Opening it marks what it shows as seen, per person on the
 * server (user_prefs 'hub.pulse.seen'), so the gold drains everywhere at once.
 * Replaces PhaseReleaseBanner, whose one hand-written April release never
 * changed. (src/components/pulse/ is the unrelated Pulse kiosk.)
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { usePulse } from '../../hooks/usePulse'
import { useUserPref, useUserPrefsStatus } from '../../hooks/useUserPref'
import { useAuth } from '../../hooks/useAuth'
import { PULSE_SEEN_NONE, pulsePillState, seenFor, type PulseSeen } from '../../lib/pulsePill'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import { WhatsNewTab } from './WhatsNewTab'
import { LabPulseTab } from './LabPulseTab'

type Tab = 'news' | 'pulse'

function validSeen(stored: unknown): PulseSeen {
  const s = stored as Partial<PulseSeen> | null
  return {
    releaseId: typeof s?.releaseId === 'string' ? s.releaseId : null,
    announcementId: typeof s?.announcementId === 'string' ? s.announcementId : null,
  }
}

export default function PulsePill() {
  const { data } = usePulse()
  const isPi = useAuth().user?.isPi === true
  const [seen, setSeen] = useUserPref<PulseSeen>('hub.pulse.seen', PULSE_SEEN_NONE, validSeen)
  // Until the server answers, this device may hold no seen state at all:
  // neither light the pill nor record anything against a stale copy.
  const seenLoaded = useUserPrefsStatus() !== 'loading'
  const state = pulsePillState(data, seen, isPi, seenLoaded)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('pulse')
  const rootRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)

  const toggle = () => {
    if (open) { setOpen(false); return }
    setTab(state.openTab)
    setOpen(true)
  }

  // Mark seen what the open tab is showing, when it shows it: on open, on a
  // tab switch, and when the payload arrives or changes while open. Only that
  // tab's item moves (seenFor), so an announcement drains only once shown.
  useEffect(() => {
    if (!open || !data || !seenLoaded) return
    const next = seenFor(data, tab, seen)
    if (next.releaseId !== seen.releaseId || next.announcementId !== seen.announcementId) setSeen(next)
  }, [open, tab, data, seen, seenLoaded, setSeen])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); pillRef.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={pillRef}
        type="button"
        data-testid="pulse-pill"
        data-pulse-tone={state.tone}
        className={`pulse-pill${state.tone === 'news' ? ' pulse-pill-news' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <span className={state.tone === 'news' ? 'pulse-dot-news' : 'pulse-dot'} aria-hidden="true" />
        <span>{state.label}</span>
        <ChevronRight {...ICON_PROPS} size={12} aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 150ms ease' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="What's new and Lab pulse"
            className="pulse-panel tk"
            // Rule 44: transform only, never an opacity fade.
            initial={{ y: -4 }}
            animate={{ y: 0 }}
            exit={{ y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <SegmentedToggle<Tab>
              ariaLabel="Panel"
              idPrefix="pulse"
              options={[{ value: 'news', label: "What's new" }, { value: 'pulse', label: 'Lab pulse' }]}
              value={tab}
              onChange={setTab}
            />
            <div role="tabpanel" id={`pulse-tabpanel-${tab}`} aria-labelledby={`pulse-tab-${tab}`} className="pulse-body">
              {tab === 'news' ? <WhatsNewTab data={data} isPi={isPi} /> : <LabPulseTab data={data} isPi={isPi} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
