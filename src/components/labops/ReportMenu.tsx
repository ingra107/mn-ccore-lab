import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Copy, Download, Printer, RefreshCw } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { localDateKey } from '../../lib/dateUtils'
import { isProjectActive } from '../../lib/taskConstants'
import { formatWeekRange } from '../../lib/isoWeek'
import { buildLabReport, buildLeadershipInsights, buildPiReport, buildTasksCsv } from '../../lib/labReports'
import { useProjects, useIdeas, useProjectHealth } from '../../hooks/useApiData'
import { usePIDashboard } from '../../hooks/usePIDashboard'
import { insightsKey } from '../../hooks/useInsightsDashboard'
import { useWeekParam } from '../../hooks/useWeekParam'
import { useWeekStats } from '../../hooks/useWeekStats'
import { useAuth } from '../../hooks/useAuth'

// The Lab overview's Report menu (PI only): every report action the old pages
// carried, in one place. Analytics gave Copy report and Export CSV; PI
// analytics gave Copy report (a different text) and Print; Insights gave
// Refresh. Nothing is merged, so each output keeps its own words.
export default function ReportMenu() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { monday, apiWeek } = useWeekParam()
  const { tasks, weekStats } = useWeekStats(monday)
  const { data: projects = [] } = useProjects()
  const { data: ideas = [] } = useIdeas()
  const { data: healthData } = useProjectHealth()
  const { data: pi } = usePIDashboard()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey) }
  }, [open])

  const insights = useMemo(() => (pi ? buildLeadershipInsights(pi) : []), [pi])

  if (!user.isPi) return null

  const done = (msg: string) => {
    setOpen(false)
    setNote(msg)
    setTimeout(() => setNote(null), 2000)
  }

  const copyLab = () => {
    const text = buildLabReport({
      today: new Date().toLocaleDateString(),
      weekRange: formatWeekRange(monday),
      weekStats,
      activeProjects: projects.filter((p) => isProjectActive(p.status)).length,
      pendingTasks: tasks.filter((t) => !t.completed).length,
      ideas: ideas.filter((i) => i.status !== 'archived').length,
      health: healthData?.summary ?? null,
    })
    void navigator.clipboard.writeText(text)
    done('Lab report copied')
  }

  const copyPi = () => {
    if (!pi) return
    void navigator.clipboard.writeText(buildPiReport(pi, insights, new Date().toLocaleDateString()))
    done('PI report copied')
  }

  const exportCsv = () => {
    const blob = new Blob([buildTasksCsv(tasks)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mnccore-tasks-${localDateKey()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    done('Tasks exported')
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: insightsKey(apiWeek) })
    void queryClient.invalidateQueries({ queryKey: ['pi-dashboard'] })
    void queryClient.invalidateQueries({ queryKey: ['lab-pulse'] })
    void queryClient.invalidateQueries({ queryKey: ['insight-connections'] })
    done('Refreshing')
  }

  const item = (label: string, Icon: typeof Copy, onClick: () => void, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-2"
      style={{ border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 12, cursor: disabled ? 'default' : 'pointer', textAlign: 'left', opacity: disabled ? 0.45 : 1 }}
    >
      <Icon {...ICON_PROPS} size={12} />
      {label}
    </button>
  )

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        className="tk-btn"
      >
        {note ?? 'Report'}
        <ChevronDown {...ICON_PROPS} size={12} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Report"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 200,
            background: 'var(--cream)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu)', zIndex: 'var(--z-dropdown)' as unknown as number,
            padding: '6px 0',
          }}
        >
          {item('Copy lab report', Copy, copyLab)}
          {item('Copy PI report', Copy, copyPi, !pi)}
          {item('Export tasks CSV', Download, exportCsv)}
          {item('Print', Printer, () => { setOpen(false); window.print() })}
          {item('Refresh data', RefreshCw, refresh)}
        </div>
      )}
    </div>
  )
}
