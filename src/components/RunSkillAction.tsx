import { Play } from 'lucide-react'
import { buildRunSkillUri, SKILL_NAME_RE } from '../lib/urlClassify'
import { useProtocolLaunch } from '../hooks/useProtocolLaunch'
import { useLauncherInstalled } from '../hooks/useLauncherInstalled'
import { useAuth } from '../hooks/useAuth'
import { ICON_PROPS } from '../lib/iconProps'

// The teal Run button on a skill-backed task (2026-11-02). Nick: "if its something i
// should run i guess it should just hav ea button to run it like the "work-on"
// button but maybe its a teal color because its a special run this to start a
// session that will complete this task after its done and i interact with the
// session".
//
// It fires mnccore://run/<task id>. On Nick's laptop PB reads the skill from its own
// copy of the task (refusing unless the skill and the task's source are in PB's
// git-tracked enums.RUN_SKILLS), opens a Claude session that first asks him
// "Start /<skill> for <task>?", runs the skill on yes, and checks the task off
// only when he confirms the run is finished. `skill` here is the
// LABEL only; it never travels in the URI.
//
// Gate, same as WorkOnActions: the browser's computer has the launcher, and the
// viewer is the PI (the PB launcher is Nick's own; members have no skills to run).
// Teal is the accent's job (primary action), through the same tk-btn tk-pri class
// the week-plan Start button uses, so the one special action on the card reads as
// the primary one while Work on stays gray.

interface Props {
  taskId: string
  /** The task's skill name (tasks.run_skill), shown in the label and tooltip. */
  skill: string
  /** A closed task has nothing left to run. */
  done?: boolean
  /** 'slot' = the Today card's fixed action slot (24px high); 'rail' = a full-width
   *  button in a side panel. */
  variant?: 'slot' | 'rail'
}

export default function RunSkillAction({ taskId, skill, done = false, variant = 'slot' }: Props) {
  const { launch } = useProtocolLaunch()
  const [launcherInstalled] = useLauncherInstalled()
  const { user } = useAuth()
  const uri = buildRunSkillUri(taskId)

  if (done || !uri || !SKILL_NAME_RE.test(skill) || !launcherInstalled || !user?.isPi) return null

  const run = () =>
    launch(uri, { successMessage: `Starting /${skill} in Claude on this machine…` })
  const tip = `Run /${skill} in Claude; checks this off when you finish`

  if (variant === 'rail') {
    return (
      <button
        type="button"
        onClick={run}
        className="tk-btn tk-pri"
        aria-label={tip}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', fontSize: 'var(--text-small)', fontWeight: 500, borderRadius: 'var(--radius-md)', padding: '8px 12px' }}
      >
        <Play {...ICON_PROPS} size={14} /> Run /{skill}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={run}
      className="tk-btn tk-sm tk-pri tip"
      data-tip={tip}
      aria-label={tip}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px', flexShrink: 0 }}
    >
      <Play {...ICON_PROPS} size={12} /> Run
    </button>
  )
}
