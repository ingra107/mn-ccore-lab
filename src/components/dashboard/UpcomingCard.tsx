import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useMeetingsApi, useMeetingLinkedTasks, useMeetingCadence, useTasks } from '../../hooks/useApiData'
import { useGrantProducts } from '../../hooks/useGrantProducts'
import { grantName } from '../../lib/grants'
import { localDateKey } from '../../lib/dateUtils'
import { countActionsByMeetingId } from '../../lib/meetingTaskCounts'
import { isTaskDone } from '../../lib/taskGrouping'
import { getPersonInfo } from '../../data/team'
import BentoCard from './BentoCard'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'

interface Deadline {
  date: string
  label: string
  type: 'task' | 'grant' | 'milestone'
  daysUntil: number
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function UpcomingCard() {
  const { data: meetings = [] } = useMeetingsApi()
  // #507 follow-up opt-out: a useMeetingLinkedTasks failure only hides the
  // "N/M pending" sub-row below (guarded by `meetingActionCounts.total > 0`)
  // -- it never renders a false "0 pending" claim, so no isError branch here.
  // Deadlines (from tasks/grants) and the meeting banner are unaffected.
  const { data: allMeetingTasks = [] } = useMeetingLinkedTasks()
  const { data: cadence } = useMeetingCadence()
  const { data: tasks = [] } = useTasks()
  const { data: grantData } = useGrantProducts()
  const grants = useMemo(() => grantData?.data ?? [], [grantData])

  // Aggregate real deadlines from open tasks (with due_date) + grant milestones.
  // Full list here; the card shows the first rows. Overdue first (most-overdue first), then ascending by days-until-due.
  const deadlines = useMemo<Deadline[]>(() => {
    const now = new Date()
    const items: Deadline[] = []

    // Open tasks with a due_date (skip completed)
    for (const t of tasks) {
      if (!t.due_date || isTaskDone(t)) continue
      const due = new Date(t.due_date + 'T23:59:59')
      const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        date: formatDateShort(due),
        label: t.title || t.description || 'Untitled task',
        type: 'task',
        daysUntil,
      })
    }

    // A grant's post-award milestones are milestone tasks, so the task loop
    // above already carries them (grant_milestones retired 2026-10-12).

    // Grant submission dates: an application still in play with a due date.
    for (const g of grants) {
      if (g.kind !== 'grant_application' || g.bucket === 'ended' || !g.deadline) continue
      const due = new Date(g.deadline + 'T23:59:59')
      const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        date: formatDateShort(due),
        label: `${grantName(g)}${g.venue ? ` (${g.venue})` : ''}`,
        type: 'grant',
        daysUntil,
      })
    }

    // Sort: overdue first (negative days, most overdue first), then ascending by days-until-due
    items.sort((a, b) => {
      const aOver = a.daysUntil < 0
      const bOver = b.daysUntil < 0
      if (aOver && bOver) return a.daysUntil - b.daysUntil  // -10 before -2
      if (aOver) return -1
      if (bOver) return 1
      return a.daysUntil - b.daysUntil  // ascending future
    })

    return items
  }, [tasks, grants])
  const next7 = useMemo(() => deadlines.filter((d) => d.daysUntil >= 0 && d.daysUntil <= 7).length, [deadlines])
  const overdueN = useMemo(() => deadlines.filter((d) => d.daysUntil < 0).length, [deadlines])

  // Find the next upcoming meeting — closest future date wins, regardless of status
  const nextMeeting = useMemo(() => {
    const today = localDateKey()
    const future = [...meetings]
      .filter((m) => m.date >= today && m.status !== 'cancelled')
      .sort((a, b) => a.date.localeCompare(b.date))
    return future[0] ?? null
  }, [meetings])

  // T19 (#547): dual-id join (T3: IN (id, source_id)) via the shared
  // countActionsByMeetingId, so a PB-calendar-matched next meeting's tasks
  // aren't undercounted.
  const meetingActionCounts = useMemo(() => {
    if (!nextMeeting) return { pending: 0, total: 0 }
    const counts = countActionsByMeetingId(allMeetingTasks, [nextMeeting]).get(nextMeeting.id)
    return { pending: counts?.pendingCount ?? 0, total: counts?.actionCount ?? 0 }
  }, [nextMeeting, allMeetingTasks])

  // Wave 3 (Lab Overview option A): hero = deadlines in the next 7 days, then
  // three one-line rows. The next meeting is the first row when there is one, so
  // the card keeps its height; the cadence note, facilitator and action count
  // ride on that row's second fact and tooltip.
  const rows = deadlines.slice(0, nextMeeting ? 2 : 3)
  const facilitator = nextMeeting?.facilitator ? getPersonInfo(nextMeeting.facilitator) : null
  const meetingFacts = [
    facilitator ? facilitator.name.split(' ')[0] : null,
    meetingActionCounts.total > 0 ? `${meetingActionCounts.pending}/${meetingActionCounts.total} pending` : null,
  ].filter(Boolean).join(' · ')
  const cadenceNote = cadence && cadence.recommendation !== 'no_upcoming' ? cadence.recommendation : null

  return (
    <BentoCard
      title="Upcoming"
      hero={{
        value: next7,
        label: overdueN > 0 ? `next 7 days · ${overdueN} overdue` : 'next 7 days',
        rule: overdueN > 0 ? 'overdue' : next7 > 0 ? 'urgent' : 'none',
      }}
      size="span-1"
      uniform
    >
      <div className="flex flex-col h-full">
        <div>
          {nextMeeting && (
            <Link
              to={PATHS.meeting(nextMeeting.id)}
              className="bento-row"
              title={[nextMeeting.title, cadenceNote, meetingFacts].filter(Boolean).join(' · ')}
            >
              <span className="bento-row-f" style={{ width: 40, color: 'var(--sk-t2)' }}>
                {formatDateShort(new Date(nextMeeting.date + 'T12:00:00'))}
              </span>
              <span className="bento-row-t">{nextMeeting.title.split(':')[0]}</span>
              <span className="bento-row-f">{meetingFacts || 'meeting'}</span>
            </Link>
          )}
          {!nextMeeting && deadlines.length === 0 && (
            <div className="py-3" style={{ fontSize: 'var(--label-size)', color: 'var(--sk-t3)' }}>
              No meeting scheduled. No upcoming deadlines.
            </div>
          )}
          {rows.map((d, i) => {
            const isOverdue = d.daysUntil < 0
            const isUrgent = d.daysUntil >= 0 && d.daysUntil <= 7
            return (
              <div key={i} className="bento-row" title={`${d.label} (${d.type})`}>
                <span className="bento-row-f" style={{ width: 40, color: isOverdue ? 'var(--job-overdue)' : isUrgent ? 'var(--job-stale)' : 'var(--sk-t2)', fontWeight: isOverdue ? 600 : 400 }}>
                  {d.date}
                </span>
                <span className="bento-row-t">{d.label}</span>
                <span className="bento-row-f" style={{ textTransform: 'capitalize' }}>{d.type}</span>
              </div>
            )
          })}
        </div>
        <div className="bento-foot">
          <Link to={PATHS.deadlines} className="flex items-center gap-1 portal-footer-link"
            style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', textDecoration: 'none' }}>
            All deadlines <ArrowRight {...ICON_PROPS} size={11} />
          </Link>
        </div>
      </div>
    </BentoCard>
  )
}

export default memo(UpcomingCard)
